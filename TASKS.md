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

### P5 — Deployment pattern  *(decided: a real reverse proxy on the box)*
Put a production reverse proxy (nginx or Caddy) in front of the app as the single public
entry point, replacing the Vite dev server as origin. This also resolves the P11
redirect-vs-proxy question — Cloudflare/Funnel can point at the proxy and serve the app
under `marcusthelegend.com` directly.
- [ ] Add an `nginx`/`caddy` service to Compose as the public entry; add its config
  (`nginx.conf` / `Caddyfile`): serve the built frontend and `proxy_pass /api` + `/static`
  → Flask.
- [ ] Build the frontend for production (`npm run build`) and serve the static `dist/`
  from the proxy instead of `npm run dev`.
- [ ] Serve the backend with a production WSGI server (gunicorn) instead of the Flask dev
  server.
- [ ] Repoint **Tailscale Funnel** (or a Cloudflare Tunnel) at the proxy's port instead
  of `:5173`.
- [ ] Add a `docker-compose.prod.yml` (or override) documenting the deploy topology.

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
- [ ] Audit the zone: apex proxied `CNAME → …ts.net` Funnel, `api` / `api-staging-env`
  A records, `pay` (GoDaddy commerce), `_domainconnect` (GoDaddy helper — remove if unused).
- [ ] **Decide redirect vs. proxy.** Confirmed: apex + `www` both 301-redirect to the
  Funnel URL, so the browser address bar shows `…ts.net`, not `marcusthelegend.com`. To
  keep the vanity URL, switch from the Cloudflare **redirect Rule** to transparent
  proxying (dashboard change — needs a token with Rules access, current token is DNS-only)
  or resolve it via the P5 reverse proxy. No action if the redirect is acceptable.
- [ ] Tie the `api` / `api-staging-env` hosts into the P4 multi-environment work.
- [ ] Review Cloudflare SSL/TLS mode and proxied-record security (hides the home IP;
  consider WAF / rate-limit rules — overlaps P6 cost controls).

---

## In Progress

_(nothing yet)_

## Done

_(nothing yet)_
