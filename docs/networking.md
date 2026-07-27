# Networking & production deployment

How `marcusthelegend.com` reaches the app, and how the production stack is put
together. The app runs on a headless DGX Spark on a home network — there is no cloud
host and **no inbound port open on the router**.

## The chain

```
Visitor → https://marcusthelegend.com          ← URL persists; no redirect
   │   registrar: GoDaddy (domain only; nameservers delegated to Cloudflare)
   ▼
Cloudflare — authoritative DNS + edge TLS
   │   apex and www are proxied CNAMEs → <tunnel-id>.cfargotunnel.com
   ▼
cloudflared — Cloudflare Tunnel, outbound-only (QUIC to the Cloudflare edge)
   │   forwards every hostname, Host header intact, to
   ▼
nginx :80 (published on 127.0.0.1:8080)
   │   serves the built SPA and /static/images from disk;
   │   proxies /api and other /static to
   ▼
gunicorn :5000 (Flask) → PostgreSQL + Gemini + Kokoro
```

Because cloudflared **dials out** to Cloudflare, no port forwarding is required and the
home IP is never exposed. There is nothing to open on the router.

## Roles

1. **GoDaddy** is the registrar only. It does not serve DNS — nameservers point at
   Cloudflare. (`pay` and `_domainconnect` records are GoDaddy commerce leftovers and
   are unrelated to the app.)
2. **Cloudflare** is authoritative DNS and the TLS edge. `marcusthelegend.com` and
   `www` are proxied `CNAME`s to `<tunnel-id>.cfargotunnel.com`. Cloudflare flattens
   the apex CNAME to A records automatically. Certificates are Cloudflare's.
3. **cloudflared** runs as a Compose service and maintains four QUIC connections to
   nearby Cloudflare edge locations. Its ingress rules (`cloudflared/config.yml`) map
   every public hostname to nginx — **all real routing happens in nginx**, by `Host`
   header, so the tunnel config stays trivial and route changes stay in git.
4. **nginx** is the single origin. It serves the production frontend build, serves
   `/static/images/` straight off the bind mount (the bulk of the bytes), and proxies
   `/api/` to Flask with long timeouts, since image generation and TTS can take minutes.
5. **gunicorn** replaces the Flask dev server: 2 workers × 8 threads. Threads rather
   than processes because nearly every slow request is blocked on an outbound call
   (Gemini, Kokoro), not on CPU. Chat sessions persist in `story.chat_history` in the
   database, so no worker affinity is needed.

## Running it

```bash
# Production
docker compose -f docker-compose.prod.yml up --build -d

# Development (Vite dev server + Flask dev server, unchanged)
docker compose up --build -d
```

**Run only one at a time.** Both bind port `5000` on the host network, so the second
stack to start will fail.

The production stack is a standalone compose file rather than an override, because the
two topologies differ in almost every service — built SPA vs. Vite dev server, gunicorn
vs. the Flask dev server.

## Client IPs and access logs

nginx trusts `CF-Connecting-IP` from the tunnel (see `real_ip_header` in
`nginx/conf.d/marcusthelegend.conf`) and logs the real visitor IP plus the `Host`:

```bash
docker compose -f docker-compose.prod.yml logs nginx
```

This matters: under the old Vite-proxy setup every request reached Flask from the
frontend container's IP, so it was impossible to tell visitors apart — or to tell
whether anyone other than the developer was using the app at all.

## Credentials

Tunnel credentials live in **`~/.cloudflared/`** on the host: `cert.pem` (account
credential from `tunnel login`) and `<tunnel-id>.json` (the tunnel's own credential).
They are mounted read-only into the cloudflared container and are **never committed**.

This directory is the one part of the deployment not reproducible from the repo —
**back it up alongside the Postgres dumps.** Losing it means recreating the tunnel and
repointing DNS.

Because the credential files are `0400` and owned by the host user, the cloudflared
service runs as that UID rather than the image's default `65532`.

## Tunnel admin commands

The `cloudflared` image is distroless and runs as UID 65532, which fights with a
host-owned credentials directory. This wrapper works for any subcommand:

```bash
cfd() {
  docker run --rm --user $(id -u):$(id -g) \
    -e HOME=/tmp -w /tmp/.cloudflared \
    -v ~/.cloudflared:/tmp/.cloudflared \
    cloudflare/cloudflared:latest "$@"
}

cfd tunnel list
cfd tunnel login                                    # prints a URL; open it anywhere
cfd tunnel route dns --overwrite-dns marcus <host>  # create the CNAME
```

All three flags are load-bearing: `--user` so files are written as you, `HOME=/tmp`
because overriding the user leaves `HOME` unset, and `-w` because cloudflared writes a
temporary private key into its working directory.

`tunnel login` does **not** need a browser on the DGX. It prints a URL and polls until
you authorize it from any device; the certificate then downloads automatically.

## Adding an environment

`dev.marcusthelegend.com` is three additions:

1. **DNS** — `cfd tunnel route dns --overwrite-dns marcus dev.marcusthelegend.com`
2. **Ingress** — one `hostname:` entry in `cloudflared/config.yml` → `http://nginx:80`
3. **nginx** — a `server` block matching that `server_name`, pointing at that
   environment's backend port and document root

The environment itself still needs a separate database, images directory, and gunicorn
port. See `TASKS.md` P4.

> **Database safety:** migrations run automatically on backend start
> (`flask db upgrade`). A dev container started with production's `DATABASE_URL` will
> silently migrate production, and this project has a prior total-loss incident. Keep
> `DATABASE_URL` in per-environment env files; never a shared default.

## History / gotchas

- Public access previously ran **Cloudflare → Tailscale Funnel → Vite dev server**, with
  a Cloudflare **Redirect Rule** 301'ing the domain to
  `spark-b0aa.taileb1e78.ts.net`. That rule matched *all incoming requests*, so it
  swallowed every subdomain — it would have broken `dev.` too — and it meant the browser
  address bar showed the `…ts.net` hostname rather than the domain. It is now **disabled**
  in the Cloudflare dashboard, and re-enabling it is the rollback lever.
- **Tailscale Funnel is a permanent second entry point, not a fallback.** It points at
  nginx (`tailscale funnel --bg http://127.0.0.1:8080`), so the app is also served at
  `spark-b0aa.taileb1e78.ts.net`. Existing users — 10–12 year olds on iPads, who cannot
  be talked through clearing a browser cache (see *Who uses this* in `CLAUDE.md`) — have
  that hostname bookmarked and still hold the old cached 301, so it must keep working. **Do not run
  `tailscale funnel --https=443 off`.** This makes `tailscaled` a production
  dependency: if it stops, those users lose access even though the domain is fine.
- **Never add a redirect from the `…ts.net` host to `marcusthelegend.com`.** Browsers
  that cached the old 301 (domain → tailnet) would bounce between the two forever:
  `ts.net` → domain → *cached* 301 → `ts.net` → … ending in
  `ERR_TOO_MANY_REDIRECTS`, with no user-side recovery. Serving the same app on both
  hostnames, as now, is the only safe arrangement while those caches survive.
  If the tailnet hostname ever does need retiring, migrate with a **link** to a URL the
  stale redirect was never cached against (e.g. `https://marcusthelegend.com/?m=1` —
  browsers key cached redirects by full URL), not with an HTTP redirect.
- Tailscale remains the way to reach the box for administration regardless.
- The known **Vite HMR WebSocket failure through Tailscale** only affects the dev stack.
  Cloudflare Tunnel proxies WebSockets properly, so serving a dev environment through
  the tunnel may sidestep it — untested.

## TLS posture

Audited and corrected **2026-07-27**.

| Setting | Was | Now |
|---------|-----|-----|
| SSL/TLS mode | `flexible` | **`strict`** (Full strict) |
| Always Use HTTPS | `off` | **`on`** |
| Minimum TLS version | `1.0` | **`1.2`** |
| HSTS | disabled | still disabled — see below |

**SSL/TLS mode** controls how Cloudflare's edge reaches the origin. *Flexible* means the
edge serves HTTPS to the visitor but fetches from the origin over cleartext HTTP.

For the app this is **moot**: tunnel-backed hostnames don't use that setting, because
cloudflared holds an encrypted connection to the edge and its hop to nginx never leaves
the box. It does affect **`pay.marcusthelegend.com`**, a proxied CNAME to GoDaddy — that
leg crosses the internet, and under *Flexible* Cloudflare fetches it in the clear. It is
a payments link, so this is the part worth fixing. Switching to Full (strict) does not
affect the tunnel hostnames.

**Always Use HTTPS was off**, which was the live exposure: `http://marcusthelegend.com`
returned the whole app over unencrypted HTTP, login POST included. It now 301s to HTTPS.
This is safe with respect to the cached-redirect problem above — a scheme upgrade landing
on a working page is not a hostname change, so it cannot loop.

**Minimum TLS is 1.2.** Safe for the audience despite the old-iPad concern: Safari on iOS
has supported TLS 1.2 since iOS 5 (2011), so any iPad capable of running this app
negotiates it. The "old device" risk for TLS 1.2 is old Android and desktop IE, not iPads.

**HSTS is deliberately still off.** It is the one setting here that is unpleasant to walk
back — browsers honour the `max-age` regardless of what the server later says. If it is
turned on, start with a short `max-age` and no `preload`.

Changing these needs **`Zone Settings: Edit`** on the API token in `backend/.env`
(currently: DNS Write, Zone Settings Write, Zone Read — scoped to this zone).

Verifying after a change:

```bash
for s in ssl always_use_https min_tls_version; do
  curl -s -H "Authorization: Bearer $TOKEN" \
    "https://api.cloudflare.com/client/v4/zones/$ZONE/settings/$s"
done
curl -sI http://marcusthelegend.com | head -1   # expect 301
```

Note that a certificate failure under Full (strict) surfaces as a **526**, not a 404 —
`pay.marcusthelegend.com` returning its origin's 404 is a pass, not a symptom.

### The tailnet path bypasses all of this

Tailscale Funnel terminates TLS with its own certificate and goes straight to nginx.
**No Cloudflare setting, WAF rule, or rate limit applies to it** — and that is the path
existing users are on.

This matters for **P6 (cost controls)**: rate limiting Gemini and Kokoro at Cloudflare's
edge would leave the tailnet path completely unthrottled. Those limits belong in
**nginx or the app**, where both entry points converge.
