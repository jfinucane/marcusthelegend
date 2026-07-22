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
   a single origin and there is no CORS or base-URL juggling in the client.
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

## Public access — how `marcusthelegend.com` reaches the DGX

The app runs entirely on a headless DGX Spark on a home network — there is no cloud
host and no open inbound port on the router. Public traffic reaches it through a chain
of three services:

```
Visitor → https://marcusthelegend.com
   │   registrar: GoDaddy  (domain only; nameservers delegated to Cloudflare)
   ▼
Cloudflare  — authoritative DNS (gordon/teagan.ns.cloudflare.com) + edge TLS
   │   apex is a proxied CNAME → the Funnel host; the edge 301s to the Funnel URL
   ▼
https://spark-b0aa.taileb1e78.ts.net/   — Tailscale Funnel (public ingress)
   │   proxies to
   ▼
127.0.0.1:5173  — Vite (frontend) on the DGX
   │   /api and /static are proxied on to
   ▼
Flask :5000  →  PostgreSQL + Gemini + Kokoro
```

1. **GoDaddy** is the domain **registrar**. It does not serve the app's DNS — the
   nameservers are pointed at Cloudflare.
2. **Cloudflare** is the authoritative **DNS** and TLS edge. The apex
   `marcusthelegend.com` is a **Cloudflare-proxied `CNAME` to
   `spark-b0aa.taileb1e78.ts.net`** (the Funnel host). Because a `CNAME` isn't allowed at
   a zone apex, Cloudflare **flattens** it to A records — which is why the root resolves
   to Cloudflare's anycast IPs. At the edge, a request to the domain is answered with a
   **301 redirect to `https://spark-b0aa.taileb1e78.ts.net/`**. (Because it's a redirect,
   the browser's address bar ends up showing the `…ts.net` URL — which is why both
   hostnames are listed in `vite.config.js` → `server.allowedHosts`.)
3. **Tailscale Funnel** is the actual public ingress. `tailscale funnel` exposes
   `https://spark-b0aa.taileb1e78.ts.net` to the internet over Tailscale's relays — no
   router port-forwarding required — and proxies it to the Vite dev server on
   `127.0.0.1:5173`. TLS for the Funnel hostname is a Tailscale-issued cert.
4. **Vite** serves the SPA and proxies `/api` + `/static` to Flask, as in the request
   flow above.

> **Where each piece is configured:** domain registration → GoDaddy; DNS records +
> redirect rule → the **Cloudflare** dashboard (not GoDaddy); public ingress →
> `tailscale funnel` on the DGX (`tailscale funnel status` shows the `:5173` mapping).

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
| `POST /api/tts` | Magpie (`:8001`) | Voice synthesis; returns raw PCM wrapped into a WAV. |
| `POST /api/stories/<id>/kokoro-tts` | Kokoro FastAPI (GPU, `spark-b0aa:8880`) | Per-story narration in the story's `kokoro_voice`. |
| `POST /api/translate` | Local LLM (Nemotron, `:8000`) | Normalizes text for speech (numbers → words). |

The backend does light glue work — e.g. `pcm_to_wav()` hand-builds a RIFF/WAVE header
around Magpie's raw PCM — and otherwise forwards requests, keeping the model services
decoupled from the app.

## Frontend structure

- `src/api.js` — a single `request()` helper wrapping `fetch`; all endpoints are thin
  exports over it. `BASE_URL` is empty by default (same-origin via the dev proxy) and
  overridable with `VITE_API_URL`.
- `src/pages/` — `WorldsPage`, `WorldDetailPage`, `StoryDetailPage`, `LoginPage`.
- `src/components/` — scene editor, montage/storybook players, Kokoro voice picker,
  image-bucket picker, and the drag-and-drop cards.

## Related docs

- **[../README.md](../README.md)** — overview, screenshots, quickstart.
- **[API reference](api.md)** — _stubbed pending the authentication work; see
  [../TASKS.md](../TASKS.md)._
