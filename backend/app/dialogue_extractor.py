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

# Give up on an item after this many failed extraction attempts (dead-letter).
MAX_ATTEMPTS = 3

# Serializes every Ollama call — the sweep loop, the image_service fallback, and
# the /api/translate normalizer in routes/tts.py — so concurrent callers can't pile
# up on the single-GPU model and blow past the request timeout while queued.
# All Ollama access must go through ollama_generate.
_ollama_lock = threading.Lock()

# Single-flights the full-table sweep: a trigger that arrives while a sweep is
# already running is dropped rather than stacking another redundant sweep.
_sweep_lock = threading.Lock()

EXTRACT_PROMPT_PREFIX = (
    "Extract all spoken dialogue from this comic panel description. "
    "Return ONLY a JSON array of objects with \"speaker\" and \"text\" fields. "
    "Ignore stage directions, visual instructions, and text in parentheses. "
    "Example: [{\"speaker\": \"Bella\", \"text\": \"I have an idea!\"}]\n\n"
    "Description: "
)


def ollama_generate(prompt: str, timeout: int = 180) -> str:
    """Single entry point for every Ollama call, serialized by _ollama_lock.

    Returns the model's raw response text. Callers do their own parsing.
    """
    payload = json.dumps({
        "model": OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
    }).encode()
    req = urllib.request.Request(
        OLLAMA_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with _ollama_lock:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())["response"].strip()


def _extract_pairs(description: str) -> list[dict]:
    raw = ollama_generate(EXTRACT_PROMPT_PREFIX + description)

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
    if not _sweep_lock.acquire(blocking=False):
        logger.info("dialogue_extractor: sweep already running, skipping trigger")
        return
    try:
        _run_sweep()
    finally:
        _sweep_lock.release()


def _run_sweep():
    db_url = os.environ["DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://")
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            # Only pick up items that still need dialogue extracted and haven't
            # already exhausted their attempts — this is what stops the same
            # failing UUIDs being re-swept forever.
            cur.execute(
                "SELECT id, description FROM story_items "
                "WHERE description IS NOT NULL AND description != '' "
                "AND adjusted_text IS NULL "
                "AND COALESCE(dialogue_attempts, 0) < %s",
                (MAX_ATTEMPTS,),
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
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE story_items "
                        "SET dialogue_attempts = COALESCE(dialogue_attempts, 0) + 1 "
                        "WHERE id = %s",
                        (item_id,),
                    )
                conn.commit()
                # Log the exception type too, so a real timeout is distinguishable
                # from a parse error / connection reset / OOM at a glance.
                logger.error(
                    "dialogue_extractor: failed %s: %s: %s",
                    item_id, type(exc).__name__, exc,
                )

        logger.info("dialogue_extractor: done — updated %d, failed %d", updated, failed)


def trigger_background_update():
    t = threading.Thread(target=_process_all, daemon=True, name="dialogue-extractor")
    t.start()
