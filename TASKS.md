# Marcus the Legend — Tasks

Working toward a **showcase-ready / reference-quality** project.
Priorities are P0 (do first) → higher numbers = later. Reorder freely;
Documentation is pinned first by request. We work these **one at a time**.

---

## To Do

### P0 — Documentation  *(pinned first — ✅ DONE, pending your review)*
- [x] Rewrite `README.md` as real portfolio docs — what it does, features, stack,
  Docker quickstart, env vars, project layout, real generated-output images.
- [x] Add `docs/architecture.md` — request flow, data model, and how the AI services
  plug in (Gemini image-gen call detail, stateful chat sessions, TTS proxy layer).
- [x] Stub the API surface in `docs/api.md` (full endpoint inventory; schemas deferred
  until after the auth work in P1).
- [x] **Capture UI screenshots** (Worlds gallery, world+entities, scene editor) via
  headless Playwright Chromium and wire them into the README "Screens" section.

### P0.1 — Cloudflare direct API access  *(setup — ✅ working)*
Enables direct DNS edits via the Cloudflare REST API (no MCP server needed).
- Zone ID (`marcusthelegend.com`): `bc7ada28985c60498a3b9f0e0158e519`  *(identifier, not a secret)*
- Account ID: `697c0f0d102f6dcdcda444bd41805b15`
- [x] Create an API token — `odd-dream-aff3`, DNS Write, expires **2026-07-29** (account-
  owned `cfat_` token; tighten to this zone if made permanent).
- [x] Token stored as `CLOUDFLARE_API_TOKEN` in `backend/.env` (gitignored) and verified
  `active`. **Note:** `cfat_` account-owned tokens verify/use via the *account-scoped*
  endpoint `…/accounts/<account_id>/tokens/verify`, not `/user/tokens/verify`.
- [x] First use: the P11 `www` fix (see below) — done via the API.

### P1 — Authentication
- [ ] Replace the shared-password check in `app/routes/auth.py` with real auth:
  per-user login issuing a session or JWT.
- [ ] Add an auth decorator and protect the write/mutating routes.
- [ ] Frontend: store/attach the token, handle 401s, add logout.

### P2 — Secrets & config hygiene  *(added)*
- [x] Confirm secrets aren't in git — verified: `.env`, `*.crt`, `*.key`, and
  `seed_users.py` are gitignored and were never committed (clean history).
- [ ] De-duplicate the Tailscale `.crt`/`.key` (copies in both root and `frontend/`).
- [ ] Consider rotating the plaintext logins in `seed_users.py` once real auth (P1) lands.
- [ ] Expand `.env.example` to document every required variable (currently minimal).

### P3 — Health check
- [ ] Add `GET /api/health` (and optionally `/api/health/db`) returning status + version.
- [ ] Wire it into `docker-compose.yml` healthchecks and `depends_on: condition: service_healthy`.

### P4 — Multiple environments
- [ ] Split `config.py` into `DevConfig` / `StagingConfig` / `ProdConfig`; select via `FLASK_ENV`.
- [ ] Stop hardcoding `FLASK_ENV: development` in compose; drive it from the environment.
- [ ] Separate frontend build config for dev vs prod (API base URL, etc.).

### P5 — Deployment pattern  *(done — see `docs/networking.md`)*
A production reverse proxy now fronts the app as the single origin, replacing the Vite
dev server. Public ingress moved from Tailscale Funnel to a **Cloudflare Tunnel**, which
also resolved P11: `marcusthelegend.com` serves the app directly, no redirect.
- [x] Add an `nginx` service to Compose as the public entry, with config
  (`nginx/conf.d/marcusthelegend.conf`): serves the built frontend, `/static/images`
  straight off the bind mount, and `proxy_pass /api` + `/static` → Flask.
- [x] Build the frontend for production (`npm run build`, multi-stage in
  `nginx/Dockerfile`) and serve the static `dist/` from the proxy.
- [x] Serve the backend with gunicorn (`backend/start-prod.sh`, 2 workers × 8 threads)
  instead of the Flask dev server.
- [x] Public ingress is a **Cloudflare Tunnel** (`cloudflared/config.yml`). Tailscale
  Funnel was repointed at nginx and **stays** as a permanent second entry point —
  existing users have the tailnet URL bookmarked.
- [x] Add `docker-compose.prod.yml` documenting the deploy topology.
- [ ] Fold `tailscale funnel status` into the health checks — `tailscaled` is now a
  production dependency.

### P6 — Cost controls
- [ ] Add rate limiting / per-user quotas on the expensive calls: Gemini image gen,
  LLM chat, Kokoro TTS.
- [ ] Track usage (counts/tokens) and expose it; add a configurable hard cap.

### P7 — Admin system
- [ ] Add an admin role and admin-only routes (user management, usage/cost dashboard,
  content moderation).
- [ ] Minimal admin UI in the frontend gated behind the admin role.

### P8 — Automated tests & CI  *(added)*
- [ ] Expand backend tests beyond the current TTS/voice/image-prompt cases (routes, auth, models).
- [ ] Add a GitHub Actions workflow to run tests + lint on PRs (`.github/` already exists).

### P9 — Structured logging & observability  *(added)*
- [ ] Replace the loose `flask.log` in the repo root with proper app logging config.
- [ ] Add request logging + error reporting; log AI-service failures with context.

### P10 — Database backups & migration discipline  *(added)*
- [ ] Document and automate Postgres backups (there was a prior data-loss incident).
- [ ] Verify Alembic migrations are current and add a restore/runbook doc.

### P11 — Cloudflare / DNS cleanup  *(added)*
- [x] Fix `www` — was NXDOMAIN on IPv4; added a proxied `CNAME www →
  spark-b0aa.taileb1e78.ts.net` (mirrors the apex). Verified: resolves on IPv4 and 301s
  to the Funnel → app. The redirect rule already covers `www`.
- [x] Audit the zone. The `api` / `api-staging-env` A records no longer exist. Remaining:
  apex + `www` (now Tunnel CNAMEs), `pay` (GoDaddy commerce), `_domainconnect` (GoDaddy
  helper — still unused, remove if you're sure).
- [x] **Decided: proxy, not redirect.** The zone-wide Redirect Rule ("Redirect to tailnet
  for marcus", matching *all* incoming requests) is **disabled** — it would also have
  broken `dev.*` later. Apex and `www` now serve the app through the Cloudflare Tunnel
  and the address bar keeps `marcusthelegend.com`.
- ~~Delete the disabled redirect rule outright.~~ **Won't do** — the rule is inert and
  is more useful left in place as the documented rollback lever
  (`docs/networking.md` → *History / gotchas*).
- [x] Apply the TLS recommendations in
  **[docs/networking.md](docs/networking.md#tls-posture--findings-and-recommendations)**.
  Done 2026-07-27: Always Use HTTPS **on** (`http://` was serving the app in the clear),
  SSL/TLS mode `flexible` → **Full (strict)** (closes the cleartext leg to the `pay`
  origin), min TLS `1.0` → **1.2**.
- [ ] Note for P6: the tailnet path bypasses Cloudflare entirely, so WAF / rate limits
  must live in **nginx or the app**, not at the edge, to cover both entry points.

### P12 — Documentation cleanup  *(added)*
Review of `docs/networking.md` and `docs/architecture.md` against the actual config and
source. Findings and suggested fixes are in
**[docs/documentation-issues.md](docs/documentation-issues.md)**.

- [ ] Fix the `CF-Connecting-IP` trust boundary in nginx — **blocks P6**, which must key
  quotas on the authenticated user rather than IP.
- [ ] Apply the remaining doc corrections listed in that file.

### P13 — Retire the tailnet entry point  *(added — revisit 2026-08-14)*
The requirement to keep serving `spark-b0aa.taileb1e78.ts.net` closes around
**2026-08-14**. Background: `docs/networking.md` → *History / gotchas*.

- [ ] Retire it by handing users a **fresh link** (e.g. `?m=1`) — never an HTTP redirect
  from the `…ts.net` host, which would loop against cached 301s.
- [ ] Then revisit what it unblocks: **P6** (edge rate limiting becomes viable again),
  the P12 `CF-Connecting-IP` item, and the P5 `tailscale funnel status` health check.

---

## In Progress

_(nothing yet)_

## Done

_(nothing yet)_
