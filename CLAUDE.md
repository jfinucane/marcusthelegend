# CLAUDE.md — Marcus the Legend (StoryForge)

Full-stack AI worldbuilding app: **World → Story → Scene**. Gemini generates
character-consistent panel art via a stateful per-story chat session; local TTS
(Kokoro/Magpie) narrates. React 18 + Vite frontend, Flask 3 + SQLAlchemy backend,
PostgreSQL, Docker Compose. See `README.md` and `docs/architecture.md` for the
full picture — this file covers only what you need to work in the repo safely.

## Run / build / test

**There are two stacks, and they are not interchangeable.** They share the repo but
differ in almost every service, and only one runs on this box at a time. Before
restarting anything, check which one is live:

```
docker inspect marcusthelegend-backend-1 \
  --format '{{index .Config.Labels "com.docker.compose.project.config_files"}}'
```

| | dev — `docker-compose.yml` | prod — `docker-compose.prod.yml` |
|---|---|---|
| Services | backend, frontend | backend, nginx, cloudflared |
| Backend | Flask dev server (`start.sh`) | gunicorn (`start-prod.sh`) |
| Frontend | Vite dev server on `:5173` | static Vite build baked into the nginx image |
| Reached via | <http://localhost:5173> | Cloudflare tunnel → nginx on `127.0.0.1:8080` |

- **Restart the stack — never a partial restart. Always pass `-f` explicitly:**
  - dev: `docker compose -f docker-compose.yml down && docker compose -f docker-compose.yml up --build -d`
  - prod: `docker compose -f docker-compose.prod.yml up --build -d`
- **A bare `docker compose ...` defaults to the dev file.** Running it while prod is
  live silently replaces the gunicorn backend with the Flask dev server and leaves
  nginx/cloudflared behind as "orphans" — the site stays up and looks fine while
  serving live traffic from a development server. If you see an orphan-containers
  warning naming nginx or cloudflared, you are driving the wrong stack.
- ⚠️ **`./start_marcus.sh` is dev-only and destructive if prod is live.** It hardcodes
  `docker-compose.yml`, runs `down --remove-orphans` (which *deletes* the running
  nginx and cloudflared containers, taking the public site down), and `fuser -k`s
  port 5000 out from under the prod backend. Do not run it on this box while prod
  is serving.
- Frontend changes reach production only by rebuilding the nginx image — the SPA is
  compiled into it by `nginx/Dockerfile` and copied to `/usr/share/nginx/html`.
  Editing `frontend/src/` alone changes nothing that prod serves.
- Backend runs on the **host network** in both stacks: API at <http://localhost:5000>,
  PostgreSQL expected at `localhost:5432`.
- Migrations run automatically on backend start (`flask db upgrade`).
- Seed a login password on first run: `docker compose exec backend python seed_users.py`

### Tests
- Backend: `cd backend && pytest` (uses in-memory SQLite via `tests/conftest.py`;
  no real DB or Gemini key needed — `GEMINI_API_KEY` defaults to `test`).
- Frontend: `cd frontend && npm test` (Vitest).

## Layout

- `backend/app/routes/` — worlds, stories, items, entities, tts, auth, image_buckets
- `backend/app/models.py` — World → Story → StoryItem (+ entities, users)
- `backend/app/image_service.py` — Gemini image generate / edit / describe
- `backend/app/chat_service.py` — stateful per-story Gemini sessions + history compaction
- `backend/app/dialogue_extractor.py` — pulls dialogue from panels for narration
- `backend/migrations/` — Alembic (Flask-Migrate)
- `frontend/src/{pages,components,api.js}`

## Who uses this

**Children aged 10–12, on iPads.** Not developers, and not you. This constrains real
decisions:

- **Safari on iOS is the target browser.** Desktop Chrome passing proves less than it
  looks; touch behaviour differs (the scene editor's `@hello-pangea/dnd` drag-and-drop
  especially). Old iPads pin the floor for TLS versions and JS/build targets.
- **They cannot self-diagnose.** No cache clearing, no DevTools, no precise bug reports.
  Prefer changes that fail *safe* over changes that fail *loudly*, and never remove an
  entry point they might have bookmarked — see `docs/networking.md` on why the
  `…ts.net` URL must keep working.
- **AI output is going to kids.** Treat safety filtering and moderation of generated
  images and narration as a requirement, not a nice-to-have (TASKS.md P7).

## Conventions & gotchas

- **Gemini model** is `gemini-3.1-flash-image-preview`, referenced in
  `image_service.py` and `chat_service.py` (`GEMINI_MODEL`). Keep these in sync.
- **TTS endpoint** is hardcoded in `backend/app/routes/tts.py`: Kokoro
  `http://spark-b0aa:8880` (GPU, DGX Spark). Default Kokoro voice `am_echo`.
- **All Ollama access must go through `ollama_generate()`** in
  `app/dialogue_extractor.py` — it serializes calls behind `_ollama_lock` so the
  dialogue sweep and `/api/translate` can't pile up on the single GPU model.
  One model serves both: `gemma4:26b` on `http://localhost:11434`.
- Chat history strips image bytes and keeps narrative + summary so sessions stay cheap
  as stories grow — preserve this when touching `chat_service.py`.
- **Database is production data with a prior total-loss incident.** Never run
  destructive DB operations without an explicit backup step. Schema changes go through
  Alembic migrations, not manual DDL.
- Generated images live in `backend/static/images/` (bind-mounted, not in git).
- Secrets are in `.env` (git-ignored): `DATABASE_URL`, `GEMINI_API_KEY`. Never commit them.
- Known issue: Vite HMR WebSocket fails when accessed through Tailscale
  (`spark-b0aa.taileb1e78.ts.net`) — dev over localhost is unaffected.

## Roadmap

Tracked in `TASKS.md`: real authentication, admin system, AI cost controls,
multi-environment config, production deployment, health checks.
