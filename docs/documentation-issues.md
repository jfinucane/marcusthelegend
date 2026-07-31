# Documentation issues

Findings from a review of **`docs/networking.md`** and **`docs/architecture.md`** on
**2026-07-31**, against the tree at commit `2aa1034`. Every claim in both documents was
checked against the actual configuration and source — `cloudflared/config.yml`,
`nginx/conf.d/marcusthelegend.conf`, both compose files, `backend/start-prod.sh`,
`models.py`, `image_service.py`, `chat_service.py`, `routes/tts.py`, `vite.config.js`,
and `TASKS.md`.

Both documents are in good shape and consistently record *why* rather than only *what*.
The items below are the exceptions. Tracked as **P12** in [../TASKS.md](../TASKS.md).

Nothing here has been fixed yet — this is the inventory.

---

## 1. `CF-Connecting-IP` is spoofable on the tailnet path

**This one is not only a documentation problem** — the doc describes behaviour the
config does not deliver.

`nginx/conf.d/marcusthelegend.conf` trusts `10.0.0.0/8`, `172.16.0.0/12` and
`192.168.0.0/16` as real-IP sources, then takes the client address from
`CF-Connecting-IP`. Requests arriving over Tailscale Funnel reach nginx via
`127.0.0.1:8080`, so nginx sees them coming from the Docker gateway (`172.17.x`/`172.18.x`)
— inside a trusted range. Consequences on that path:

- any client can set `CF-Connecting-IP` and nginx will log whatever it claims;
- with the header absent, every tailnet request logs as the *same* gateway address.

`networking.md` → *Client IPs and access logs* says nginx "logs the real visitor IP", and
that this fixed it being "impossible to tell visitors apart". That holds for the
Cloudflare path. It does **not** hold for the tailnet path — which the same document
identifies as where the existing users are. So the problem that section says was solved
is still unsolved for most real traffic.

The *TLS posture* section already caveats the tailnet bypass correctly; the logging
section needs the same treatment.

**This has direct consequences for P6.** `networking.md` is right that rate limits belong
in nginx or the app, "where both entry points converge" — but limits keyed on client IP
would be trivially spoofable from the tailnet side and would collapse all tailnet users
into one bucket.

**Suggested fixes**

- Narrow `set_real_ip_from` to the cloudflared container's address rather than all of
  RFC1918, or give each entry point its own `listen` port / `server` block so the two can
  be told apart.
- Key P6 quotas on the **authenticated user**, not on IP.
- Correct the *Client IPs and access logs* section to state which path it applies to.

---

## 2. `networking.md` overstates what the tunnel forwards

The chain diagram ("forwards every hostname, Host header intact") and *Roles* §3 ("Its
ingress rules map every public hostname to nginx") both claim the tunnel forwards
everything.

`cloudflared/config.yml` declares `marcusthelegend.com` and `www.marcusthelegend.com`,
then terminates with `- service: http_status:404`. Nothing else reaches nginx.

The document contradicts itself a few sections later: *Adding an environment* correctly
requires a new `hostname:` entry precisely because undeclared hostnames do not get
through.

**Fix:** say "each **declared** hostname". The underlying design point — that routing
decisions live in nginx, not in the tunnel config — is correct and worth keeping.

---

## 3. The HSTS note omits the flag that actually matters here

*TLS posture* advises that if HSTS is enabled, it should start with a short `max-age` and
no `preload`. Both true, but the riskiest flag in this specific zone is
**`includeSubDomains`**.

`pay.marcusthelegend.com` is a proxied CNAME to GoDaddy. Enabling `includeSubDomains` at
the apex forces HTTPS onto `pay` as well — the one leg the document already flags as
crossing the internet, under a certificate this project does not control. That is also
the hostname where breakage matters most, since it is a payments link.

**Fix:** add "and no `includeSubDomains`" to that recommendation, with the `pay` reason.

---

## 4. `architecture.md` is stale on static serving in production

Request-flow bullet 4 states without qualification:

> Generated images are written to `backend/static/images/` and served directly by Flask
> under `/static/images/...`

The diagram caption says the same. In production this is false: nginx serves that path
straight off the bind mount (`location /static/images/` → `alias /srv/images/`, with
`expires 30d` and `Cache-Control: immutable`) and Flask never sees those requests. This
is deliberate — it is the bulk of the bytes — and `networking.md` documents it correctly.

The cross-reference to `networking.md` further down is not enough, because the bullet
reads as an unconditional statement of fact.

**Fix:** qualify both the bullet and the diagram caption with "in development", and note
that nginx serves this path in production.

---

## 5. `/healthz` exists but no document mentions it

`nginx/conf.d/marcusthelegend.conf` already serves `location = /healthz`. Neither
`networking.md` nor `architecture.md` mentions it, and **TASKS.md P3** asks for a health
check as though none exists.

Whoever picks up P3 will either duplicate it or miss it. The distinction matters: the
nginx endpoint is a static 200 that proves only that nginx is up — it passes even when
gunicorn, Postgres, and the TTS services are all down. That is a different thing from the
`GET /api/health` P3 actually wants.

**Fix:** document the existing endpoint in `networking.md` and note in P3 what it does
and does not prove.

---

## 6. Smaller accuracy items in `architecture.md`

- **`ImageGenerationLog` is missing from the data model.** The model exists
  (`backend/app/models.py`) but does not appear in the *Data model* section.
- **"every content row carries `created_at` / `updated_at` (`TimestampMixin`)"** —
  `User` and `ImageGenerationLog` do not use the mixin. Reword to name the models that
  do, or say "every content row" and explicitly exclude those two.
- **The Gemini model string is hardcoded three times.** `image_service.py` repeats the
  literal `"gemini-3.1-flash-image-preview"` in `generate_image`, `edit_image` and
  `describe_image`, while `chat_service.py` defines a proper `GEMINI_MODEL` constant. The
  code sample in `architecture.md` reflects the source accurately, but the duplication is
  a real drift hazard and is worth calling out where the sample appears.

  Related, and worth fixing at the same time: **`CLAUDE.md` is wrong on this.** It states
  the model is "referenced in `image_service.py` and `chat_service.py` (`GEMINI_MODEL`).
  Keep these in sync" — but `image_service.py` has no such constant. The cleanest
  resolution is to make the code match the documentation by introducing the constant in
  `image_service.py`, rather than editing `CLAUDE.md` to describe the duplication.

---

## Verified accurate — no action needed

Recorded so this ground does not get re-checked later. All of the following were
confirmed against the source:

| Claim | Verified against |
|---|---|
| gunicorn 2 workers × 8 threads, and the threads-not-processes rationale | `backend/start-prod.sh` |
| Both stacks bind `:5000`, so only one runs at a time | `docker-compose.yml`, `docker-compose.prod.yml` (both `network_mode: host`) |
| nginx trusts `CF-Connecting-IP` via `real_ip_header` | `nginx/conf.d/marcusthelegend.conf` (see item 1 for the caveat) |
| nginx `/api` timeouts have headroom over the Vite proxy's 180s | `vite.config.js` (`proxyTimeout: 180000`) vs nginx `proxy_read_timeout 300s` |
| Cloudflare flattens the apex CNAME; tunnel hostnames bypass the SSL/TLS mode setting | Cloudflare behaviour; consistent with `cloudflared/config.yml` |
| A cert failure under Full (strict) surfaces as 526, not 404 | Cloudflare behaviour |
| Compaction after 5 images; entity files re-uploaded at 47h against a ~48h TTL | `chat_service.py` (`COMPACTION_TRIGGER = 5`, `ENTITY_FILE_TTL_HOURS = 47`) |
| `_sanitize_prompt` rewrites "background(s)" → "setting(s)" | `image_service.py` |
| Ollama-based fallback dialogue extractor | `image_service.py`, `dialogue_extractor.py` |
| All three TTS endpoints and their ports | `backend/app/routes/tts.py` |
| `BASE_URL` empty by default, overridable via `VITE_API_URL` | `frontend/src/api.js` |
| Data-model fields: `chat_history`, `chat_summary`, `chat_image_count`, `kokoro_voice`, `adjusted_text`, `order_index`, cascading deletes | `backend/app/models.py` |
| P4 / P6 cross-references point at the right tasks | `TASKS.md` |

Also checked and clean: the `.crt` / `.key` files in the repo root and `frontend/` are
gitignored and untracked, and no secrets are committed.

---

## Related docs

- **[Networking & deployment](networking.md)** — items 1, 2, 3, 5.
- **[Architecture](architecture.md)** — items 4, 6.
- **[../TASKS.md](../TASKS.md)** — P12; items 1 and 5 also touch P6 and P3.
