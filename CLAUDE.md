# CLAUDE.md — Marcus the Legend (StoryForge)

Full-stack AI worldbuilding app: **World → Story → Scene**. Gemini generates
character-consistent panel art via a stateful per-story chat session; local TTS
(Kokoro/Magpie) narrates. React 18 + Vite frontend, Flask 3 + SQLAlchemy backend,
PostgreSQL, Docker Compose. See `README.md` and `docs/architecture.md` for the
full picture — this file covers only what you need to work in the repo safely.

## Run / build / test

- **Restart the stack (always use this — never a partial restart):**
  `docker compose down && docker compose up --build -d`
- Convenience wrapper with health checks: `./start_marcus.sh`
- Frontend: <http://localhost:5173> · Backend API: <http://localhost:5000>
- Backend runs on the **host network** and expects PostgreSQL at `localhost:5432`.
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

## Conventions & gotchas

- **Gemini model** is `gemini-3.1-flash-image-preview`, referenced in
  `image_service.py` and `chat_service.py` (`GEMINI_MODEL`). Keep these in sync.
- **TTS endpoints** are hardcoded in `backend/app/routes/tts.py`:
  Kokoro `http://spark-b0aa:8880` (GPU, DGX Spark), Magpie `http://localhost:8001`,
  text-normalization LLM `http://localhost:8000`. Default Kokoro voice `am_echo`.
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
