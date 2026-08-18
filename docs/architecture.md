# Architecture

Marcus the Legend is a conventional three-tier web app — React SPA, Flask REST API,
PostgreSQL — with the twist that most of the interesting work happens in calls out to
**AI services**: Gemini for image generation and vision, and a local speech stack for
narration.

```
┌──────────────┐     /api/*, /static/*     ┌───────────────┐
│  React SPA   │ ───────────────────────▶ │   Flask API   │
│  (Vite:5173) │  (Vite dev-server proxy)  │   (:5000)     │
└──────────────┘                           └──────┬────────┘
                                                  │
                     ┌────────────────────────────┼───────────────────────────┐
                     ▼                             ▼                           ▼
              ┌─────────────┐              ┌──────────────┐            ┌───────────────┐
              │ PostgreSQL  │              │   Gemini     │            │  Speech stack │
              │ (host:5432) │              │ (images +    │            │  Kokoro / Magpie
              │             │              │  vision +    │            │  + local LLM  │
              └─────────────┘              │  chat)       │            └───────────────┘
                                           └──────────────┘
    generated images written to backend/static/images and served by Flask at /static
```

## Request flow

1. The **React SPA** (Vite dev server on `:5173`) calls the API through relative paths
   (`/api/...`, `/static/...`). In development the Vite server **proxies** those to the
   Flask backend (`vite.config.js` → `host.docker.internal:5000`), so the browser sees
   a single origin and there is no CORS or base-URL juggling in the client. In
   production the same relative paths are served by nginx instead — see
   [networking.md](networking.md).
2. **Flask** (`backend/app/__init__.py`) is an app-factory app. Each domain lives in its
   own blueprint under `app/routes/`: `worlds`, `stories`, `items`, `entities`, `tts`,
   `auth`, `image_buckets`.
3. **PostgreSQL** holds the data. SQLAlchemy models live in `app/models.py`; schema
   changes are Alembic migrations run automatically on container start (`start.sh` →
   `flask db upgrade`).
4. **Generated images** are written to `backend/static/images/` and served directly by
   Flask under `/static/images/...`. The database stores only the relative path.

> **Deployment note:** the backend container uses `network_mode: host`, and
> `DATABASE_URL` points at `localhost:5432` — i.e. PostgreSQL runs on the **host**, not
> in Compose. The frontend container reaches the backend via `host.docker.internal`.

## Public access

In production the app is fronted by **nginx** and reached over a **Cloudflare Tunnel**,
so `marcusthelegend.com` serves the app directly with no redirect. The request flow
above describes the **development** stack, where the Vite dev server proxies to Flask.

See **[networking.md](networking.md)** for the full chain, the production compose
stack, tunnel credentials and admin commands, and how to add an environment.

## Data model

```
User                      (login; password hash only)

World                     title, description, image, chat_history
 └─ Story                 title, description, order_index, voice,
     │                    kokoro_voice, chat_history, chat_summary, chat_image_count
     └─ StoryItem         type = "image_scene" | "narrative"
                          description, image_path, narrative_text,
                          adjusted_text (TTS-ready), voice, language

WorldEntity               per-world characters/props tracked for image consistency
```

- IDs are UUID strings; every content row carries `created_at` / `updated_at`
  (`TimestampMixin`).
- Deletes cascade down the hierarchy (`World` → `Story` → `StoryItem`).
- `Story.order_index` and `StoryItem.order_index` back the drag-and-drop reordering in
  the UI.
- `adjusted_text` is a TTS-normalized version of a scene's dialogue (e.g. "1970" →
  "nineteen seventy") produced for narration.

## How the AI services plug in

### Image generation — `app/image_service.py`

The core primitive is `generate_image(prompt)`. It is deliberately small: configure the
SDK, call the model, pull the image bytes out of the response, and persist them.

```python
def generate_image(prompt: str) -> str:
    import google.generativeai as genai
    prompt = _sanitize_prompt(prompt)                      # 1. massage the prompt

    genai.configure(api_key=current_app.config["GEMINI_API_KEY"])
    model = genai.GenerativeModel("gemini-3.1-flash-image-preview")

    response = model.generate_content(prompt)              # 2. one-shot generation

    for part in response.candidates[0].content.parts:      # 3. find the image part
        if part.inline_data is not None and part.inline_data.data:
            image_bytes = part.inline_data.data
            if isinstance(image_bytes, str):               #    base64 vs raw bytes
                image_bytes = base64.b64decode(image_bytes)
            ext = part.inline_data.mime_type.split("/")[-1]
            return save_image_bytes(image_bytes, ext)       # 4. write to /static/images
    raise RuntimeError(...)                                 # (surface finish_reason)
```

Points worth calling out:

- **Response shape.** Gemini returns a list of `parts`; an image comes back as an
  `inline_data` blob with a `mime_type`. The code walks the parts, decodes base64 if
  needed, normalizes `jpeg → jpg`, and writes a UUID-named file. `save_image_bytes`
  returns the server-relative URL (`/static/images/<uuid>.jpg`) that gets stored on the
  `StoryItem`.
- **Prompt sanitizing.** `_sanitize_prompt` rewrites the word "background(s)" to
  "setting(s)" — a small guard against a prompt pattern that pushed the model toward
  undesired output.
- **Failure is explicit.** If no image part is present, the code raises with the
  candidate's `finish_reason` so safety blocks / empty responses are debuggable rather
  than silent.

Two sibling functions reuse the same pattern with different inputs:

- `edit_image(image_url, modification_text)` — sends the existing image **plus** an
  instruction as a multi-part request, so edits are grounded in the current panel.
- `describe_image(image_url)` — a **vision** call that reads the dialogue out of a comic
  panel ("one line per speech bubble, `Speaker: text`"), with an Ollama-based fallback
  extractor if the structured parse fails. This feeds narration.

### Character consistency — `app/chat_service.py`

A one-shot call can't keep a character on-model across a whole story, so each **Story**
owns a *stateful Gemini chat session*:

- **Seed (ephemeral).** Rebuilt on every start/resume: the world description, entity
  reference images (via the Gemini **Files API**), an optional running summary, and the
  most-recent scene images — followed by a model acknowledgement to "maintain
  consistency."
- **Conversation turns (persisted).** Every generate/edit becomes an alternating
  user/model pair saved as JSON on `story.chat_history`. **Image bytes are stripped
  before saving** — only the text survives — so the stored history stays small.
- **Compaction.** After every 5 images the model writes a one-paragraph summary; the
  turn history is cleared and `chat_image_count` resets. The next seed carries the
  summary plus the two most-recent images instead of replaying everything. This keeps
  token cost roughly flat as a story grows.
- **Entity file freshening.** Gemini Files API uploads expire after ~48h, so entity
  references older than 47h are re-uploaded from disk on demand.

### Speech / narration — `app/routes/tts.py`

Narration is a thin proxy layer over several OpenAI-compatible speech/LLM endpoints:

| Endpoint | Upstream | Purpose |
|----------|----------|---------|
| `POST /api/stories/<id>/kokoro-tts` | Kokoro FastAPI (GPU, `spark-b0aa:8880`) | Per-story narration in the story's `kokoro_voice`. |
| `POST /api/translate` | Ollama (`gemma4:26b`, `:11434`) | Normalizes text for speech (numbers → words). |

The backend forwards requests and otherwise stays out of the way, keeping the model
services decoupled from the app. `/api/translate` shares one model with the dialogue
extractor, so it goes through `ollama_generate()` in `app/dialogue_extractor.py` —
the single lock-serialized entry point for all Ollama access.

## Frontend structure

- `src/api.js` — a single `request()` helper wrapping `fetch`; all endpoints are thin
  exports over it. `BASE_URL` is empty by default (same-origin via the dev proxy) and
  overridable with `VITE_API_URL`.
- `src/pages/` — `WorldsPage`, `WorldDetailPage`, `StoryDetailPage`, `LoginPage`.
- `src/components/` — scene editor, montage/storybook players, Kokoro voice picker,
  image-bucket picker, and the drag-and-drop cards.

## Related docs

- **[../README.md](../README.md)** — overview, screenshots, quickstart.
- **[Networking & deployment](networking.md)** — Cloudflare Tunnel, nginx, gunicorn, the
  production compose stack, and how to add an environment.
- **[API reference](api.md)** — _stubbed pending the authentication work; see
  [../TASKS.md](../TASKS.md)._
