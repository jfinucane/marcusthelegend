"""
Extract speaker/text dialogue pairs from story item descriptions using Ollama,
then write naturally-spoken lines to adjusted_text for Kokoro TTS consumption.

Each output line is formatted as: "Name says, <text>." so Kokoro reads it cleanly
without encountering colons or JSON-style labels.
"""
import json
import logging
import os
import threading
import urllib.request

import psycopg

logger = logging.getLogger(__name__)

OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "gemma4:26b"

EXTRACT_PROMPT_PREFIX = (
    "Extract all spoken dialogue from this comic panel description. "
    "Return ONLY a JSON array of objects with \"speaker\" and \"text\" fields. "
    "Ignore stage directions, visual instructions, and text in parentheses. "
    "Example: [{\"speaker\": \"Bella\", \"text\": \"I have an idea!\"}]\n\n"
    "Description: "
)


def _extract_pairs(description: str) -> list[dict]:
    payload = json.dumps({
        "model": OLLAMA_MODEL,
        "prompt": EXTRACT_PROMPT_PREFIX + description,
        "stream": False,
    }).encode()
    req = urllib.request.Request(
        OLLAMA_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        raw = json.loads(resp.read())["response"].strip()

    # Strip markdown code fences if present
    lines = raw.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].startswith("```"):
        lines = lines[:-1]

    return json.loads("\n".join(lines))


def _to_kokoro_line(speaker: str, text: str) -> str:
    text = text.strip().rstrip(".")
    return f"{speaker} says, {text}."


def _process_all():
    db_url = os.environ["DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://")
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, description FROM story_items WHERE description IS NOT NULL AND description != ''"
            )
            rows = cur.fetchall()

        logger.info("dialogue_extractor: processing %d items", len(rows))
        updated = 0
        failed = 0

        for item_id, description in rows:
            try:
                pairs = _extract_pairs(description)
                if not pairs:
                    continue
                adjusted = "\n".join(_to_kokoro_line(p["speaker"], p["text"]) for p in pairs)
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE story_items SET adjusted_text = %s WHERE id = %s",
                        (adjusted, item_id),
                    )
                conn.commit()
                updated += 1
                logger.info("dialogue_extractor: updated %s", item_id)
            except Exception as exc:
                failed += 1
                logger.error("dialogue_extractor: failed %s: %s", item_id, exc)

        logger.info("dialogue_extractor: done — updated %d, failed %d", updated, failed)


def trigger_background_update():
    t = threading.Thread(target=_process_all, daemon=True, name="dialogue-extractor")
    t.start()
