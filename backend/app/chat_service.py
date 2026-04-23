"""
Story image generation via stateful Gemini chat sessions.

Session structure
-----------------
Each Story owns a chat session.  The session is split into two parts:

  seed (ephemeral, rebuilt on every start/resume)
    Turn 0 user  — world description + entity images (Files API URIs) + optional summary +
                   most-recent scene images (fresh Files API uploads)
    Turn 1 model — acknowledgment ("I will maintain consistency …")

  conversation turns (persisted in story.chat_history as JSON)
    Alternating user/model pairs for every generate or edit operation.
    Inline image bytes are stripped before saving; only text survives.

Compaction
----------
After every COMPACTION_TRIGGER (5) images the model writes a one-paragraph summary
of story events.  The summary is saved to story.chat_summary, the conversation turns
are cleared, and chat_image_count resets to 0.  The next seed incorporates the summary
and the two most-recent scene images rather than three.

Entity file freshening
----------------------
World-entity images are tracked in the Gemini Files API.  Because files expire after
48 hours, freshen_entity_file() re-uploads from disk whenever the stored reference is
older than ENTITY_FILE_TTL_HOURS (47).  Recent seed images are always uploaded fresh
(no stored reference needed).
"""

import json
import os
import base64
from datetime import datetime, timezone, timedelta

from flask import current_app
import google.generativeai as genai

from . import db

ENTITY_FILE_TTL_HOURS = 47
MAX_CHARS_IN_SEED = 4
MAX_OTHERS_IN_SEED = 4
MAX_RECENT_IMAGES_NORMAL = 3
MAX_RECENT_IMAGES_COMPACT = 2
COMPACTION_TRIGGER = 5
SEED_MESSAGE_COUNT = 2
GEMINI_MODEL = "gemini-3.1-flash-image-preview"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _configure():
    api_key = current_app.config.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set")
    genai.configure(api_key=api_key)


def _get_model():
    _configure()
    return genai.GenerativeModel(GEMINI_MODEL)


def _storage_path():
    return current_app.config["IMAGE_STORAGE_PATH"]


def _local_path(image_url: str) -> str:
    return os.path.join(_storage_path(), os.path.basename(image_url))


def _mime(path: str) -> str:
    ext = os.path.splitext(path)[1].lstrip(".").lower()
    return f"image/{'jpeg' if ext == 'jpg' else ext}"


def _file_data_part(file_name: str, mime_type: str) -> dict:
    uri = f"https://generativelanguage.googleapis.com/v1beta/{file_name}"
    return {"file_data": {"mime_type": mime_type, "file_uri": uri}}


def _upload_for_seed(image_url: str) -> dict | None:
    """Upload an image to the Files API for use in seed messages. Returns a file_data part dict."""
    if not image_url:
        return None
    path = _local_path(image_url)
    if not os.path.exists(path):
        return None
    mime_type = _mime(path)
    uploaded = genai.upload_file(path, mime_type=mime_type)
    return {"file_data": {"mime_type": mime_type, "file_uri": uploaded.uri}}


def _to_content_objects(history: list) -> list:
    """Convert list of dicts to genai.protos.Content objects for start_chat compatibility."""
    contents = []
    for turn in history:
        parts = []
        for p in turn["parts"]:
            if "text" in p:
                parts.append(genai.protos.Part(text=p["text"]))
            elif "file_data" in p:
                parts.append(genai.protos.Part(
                    file_data=genai.protos.FileData(
                        mime_type=p["file_data"]["mime_type"],
                        file_uri=p["file_data"]["file_uri"],
                    )
                ))
        contents.append(genai.protos.Content(role=turn["role"], parts=parts))
    return contents


def _serialize_turns(chat_history) -> str:
    """
    Serialize post-seed conversation turns to JSON.
    Skips the SEED_MESSAGE_COUNT opening messages and strips any inline_data parts
    so no image bytes are persisted.
    """
    result = []
    for content in chat_history[SEED_MESSAGE_COUNT:]:
        parts = []
        for part in content.parts:
            if hasattr(part, "text") and part.text:
                parts.append({"text": part.text})
            elif hasattr(part, "file_data") and part.file_data:
                parts.append({
                    "file_data": {
                        "mime_type": part.file_data.mime_type,
                        "file_uri": part.file_data.file_uri,
                    }
                })
            # inline_data intentionally omitted
        if parts:
            result.append({"role": content.role, "parts": parts})
    return json.dumps(result)


def _extract_image(response) -> tuple:
    """Return (image_bytes, mime_type, text) from a model response candidate."""
    image_bytes = mime_type = text = None
    for part in response.candidates[0].content.parts:
        if hasattr(part, "inline_data") and part.inline_data and part.inline_data.data:
            raw = part.inline_data.data
            if isinstance(raw, str):
                raw = base64.b64decode(raw)
            image_bytes = raw
            mime_type = part.inline_data.mime_type
        elif hasattr(part, "text") and part.text:
            text = part.text
    return image_bytes, mime_type, text


# ---------------------------------------------------------------------------
# Entity file freshening (public — also used by entities route)
# ---------------------------------------------------------------------------

def freshen_entity_file(entity) -> None:
    """
    Re-upload entity image to the Gemini Files API if the stored reference is absent
    or older than ENTITY_FILE_TTL_HOURS.  Updates entity fields in place; caller is
    responsible for committing.
    """
    if not entity.image_path:
        return
    now = datetime.now(timezone.utc)
    if (
        entity.gemini_file_name
        and entity.gemini_file_uploaded_at
        and (now - entity.gemini_file_uploaded_at) < timedelta(hours=ENTITY_FILE_TTL_HOURS)
    ):
        return
    path = _local_path(entity.image_path)
    if not os.path.exists(path):
        return
    uploaded = genai.upload_file(path, mime_type=_mime(path), display_name=entity.name)
    entity.gemini_file_name = uploaded.name
    entity.gemini_file_uploaded_at = now


# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------

def _build_seed_messages(world, entities, summary_text, recent_items) -> list:
    """
    Build the two-message seed: a user turn establishing world/entity context,
    followed by a model acknowledgment.
    """
    user_parts = [{"text": f"World: {world.title}\n{world.description}\n\n"}]

    if entities:
        user_parts.append({"text": "World entities — maintain visual consistency with these throughout:\n\n"})
        for entity in entities:
            label = f"{entity.entity_type.capitalize()}: {entity.name}"
            if entity.description:
                label += f" — {entity.description}"
            user_parts.append({"text": label + "\n"})
            if entity.gemini_file_name:
                user_parts.append(_file_data_part(entity.gemini_file_name, _mime(entity.image_path or "x.png")))
            user_parts.append({"text": "\n"})

    if summary_text:
        user_parts.append({"text": f"\nStory so far:\n{summary_text}\n"})

    if recent_items:
        user_parts.append({"text": "\nMost recent scenes:\n"})
        for item in recent_items:
            label = item.caption or item.description or "Scene"
            user_parts.append({"text": f"{label}:\n"})
            part = _upload_for_seed(item.image_path)
            if part:
                user_parts.append(part)
            user_parts.append({"text": "\n"})

    model_ack = [{
        "text": (
            "Understood. I will maintain visual and narrative consistency with this world, "
            "its entities, and the scenes already generated."
        )
    }]

    return [
        {"role": "user", "parts": user_parts},
        {"role": "model", "parts": model_ack},
    ]


def _start_chat(story):
    """
    Build a ChatSession by combining a fresh seed with stored conversation turns.
    Freshens entity Files API references as a side effect (commits to DB).
    """
    from .models import WorldEntity, StoryItem

    world = story.world

    characters = (WorldEntity.query
        .filter_by(world_id=world.id, entity_type="character")
        .filter(WorldEntity.image_path.isnot(None))
        .limit(MAX_CHARS_IN_SEED).all())
    others = (WorldEntity.query
        .filter_by(world_id=world.id)
        .filter(WorldEntity.entity_type != "character")
        .filter(WorldEntity.image_path.isnot(None))
        .limit(MAX_OTHERS_IN_SEED).all())
    entities = characters + others

    _configure()
    for entity in entities:
        freshen_entity_file(entity)
    db.session.commit()

    max_recent = MAX_RECENT_IMAGES_COMPACT if story.chat_summary else MAX_RECENT_IMAGES_NORMAL
    recent_items = (StoryItem.query
        .filter_by(story_id=story.id)
        .filter(StoryItem.image_path.isnot(None))
        .order_by(StoryItem.order_index.desc())
        .limit(max_recent).all())
    recent_items.reverse()

    seed = _build_seed_messages(world, entities, story.chat_summary, recent_items)
    stored_turns = json.loads(story.chat_history) if story.chat_history else []
    full_history = _to_content_objects(seed + stored_turns)

    return _get_model().start_chat(history=full_history)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_item_image(story_item, prompt: str, story) -> tuple:
    """
    Generate an image via the story's chat session.

    Returns (image_url, description_text).
    Triggers compaction once chat_image_count reaches COMPACTION_TRIGGER.
    """
    from .image_service import save_image_bytes

    chat = _start_chat(story)
    response = chat.send_message(prompt)

    image_bytes, mime_type, description_text = _extract_image(response)
    if not image_bytes:
        finish = getattr(response.candidates[0], "finish_reason", None) if response.candidates else None
        raise RuntimeError(f"No image returned (finish_reason: {finish})")

    ext = mime_type.split("/")[-1] if mime_type and "/" in mime_type else "png"
    if ext == "jpeg":
        ext = "jpg"
    image_url = save_image_bytes(image_bytes, ext)

    story.chat_history = _serialize_turns(chat.history)
    story.chat_image_count = (story.chat_image_count or 0) + 1
    db.session.commit()

    if story.chat_image_count >= COMPACTION_TRIGGER:
        _compact(story)

    return image_url, description_text


def edit_item_image(story_item, modification_prompt: str, story) -> tuple:
    """
    Edit the item's current image via the story's chat session.

    The image is sent inline (one-shot); the returned image is saved and
    a text description is appended to history.  Returns (new_image_url, description_text).
    """
    from .image_service import save_image_bytes

    if not story_item.image_path:
        raise ValueError("Item has no image to edit")

    path = _local_path(story_item.image_path)
    mime_type = _mime(path)
    with open(path, "rb") as f:
        raw_in = f.read()

    image_part = genai.protos.Part(
        inline_data=genai.protos.Blob(mime_type=mime_type, data=raw_in)
    )

    chat = _start_chat(story)
    response = chat.send_message([image_part, modification_prompt])

    image_bytes, mime_out, description_text = _extract_image(response)
    if not image_bytes:
        finish = getattr(response.candidates[0], "finish_reason", None) if response.candidates else None
        raise RuntimeError(f"No image returned (finish_reason: {finish})")

    ext = mime_out.split("/")[-1] if mime_out and "/" in mime_out else "png"
    if ext == "jpeg":
        ext = "jpg"
    image_url = save_image_bytes(image_bytes, ext)

    story.chat_history = _serialize_turns(chat.history)
    db.session.commit()

    return image_url, description_text


def _compact(story) -> None:
    """
    Ask the model for a narrative summary, store it, and reset conversation turns.
    The next _start_chat will incorporate the summary into the seed.
    """
    chat = _start_chat(story)
    resp = chat.send_message(
        "Please write a concise one-paragraph summary of the story events, scenes, and visual "
        "elements generated so far. Focus on what has happened and how things look visually."
    )
    story.chat_summary = resp.text
    story.chat_history = json.dumps([])
    story.chat_image_count = 0
    db.session.commit()
