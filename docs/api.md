# API Reference — STUB

> ⚠️ **Work in progress.** This is an endpoint inventory, not a full reference.
> Request/response schemas and auth semantics are deliberately deferred until the
> **authentication** work lands (see [../TASKS.md](../TASKS.md)), since that will change
> how these routes are protected. Until then, treat this as a map, not a contract.

All routes are served by Flask under the `/api` prefix. Generated images are served
separately at `/static/images/<uuid>.<ext>`.

## Auth

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/auth/login` | Password-only login (shared gate — being replaced). |

## Worlds

| Method | Path |
|--------|------|
| GET / POST | `/api/worlds` |
| GET / PUT / DELETE | `/api/worlds/<world_id>` |
| POST | `/api/worlds/<world_id>/generate-image` |
| POST | `/api/worlds/<world_id>/edit-image` |
| POST | `/api/worlds/<world_id>/upload-image` |
| POST | `/api/worlds/<world_id>/set-image` |
| GET / POST | `/api/worlds/<world_id>/stories` |
| GET / POST | `/api/worlds/<world_id>/entities` |

## Stories

| Method | Path |
|--------|------|
| GET / PUT / DELETE | `/api/stories/<story_id>` |
| GET / POST | `/api/stories/<story_id>/items` |
| PATCH | `/api/stories/<story_id>/items/reorder` |
| POST | `/api/stories/<story_id>/generate-image` |
| POST | `/api/stories/<story_id>/edit-image` |
| POST | `/api/stories/<story_id>/upload-image` |
| POST | `/api/stories/<story_id>/set-image` |
| POST | `/api/stories/<story_id>/kokoro-voice` |
| POST | `/api/stories/<story_id>/kokoro-tts` |
| POST | `/api/stories/<story_id>/reset-chat` |

## Story items

| Method | Path |
|--------|------|
| PUT / DELETE | `/api/items/<item_id>` |
| POST | `/api/items/<item_id>/generate-image` |
| POST | `/api/items/<item_id>/edit-image` |
| POST | `/api/items/<item_id>/upload-image` |
| POST | `/api/items/<item_id>/set-image` |

## Entities

| Method | Path |
|--------|------|
| GET / PUT / DELETE | `/api/entities/<entity_id>` |
| POST | `/api/entities/<entity_id>/generate-image` |
| POST | `/api/entities/<entity_id>/edit-image` |
| POST | `/api/entities/<entity_id>/upload-image` |
| POST | `/api/entities/<entity_id>/set-image` |

## Speech & misc

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/tts` | Magpie voice synthesis → WAV. |
| POST | `/api/translate` | LLM text normalization for narration. |
| GET | `/api/image-buckets` | Reference image buckets. |
