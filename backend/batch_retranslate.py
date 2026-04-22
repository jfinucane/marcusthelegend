"""
Batch re-translate all story items using the updated TRANSLATE_PROMPT.
Reads narrative_text (for narrative items) or caption (for image_scene items),
calls the local LLM, and writes the result back to adjusted_text.
"""
import json
import sys
import time
import urllib.request

import os

import psycopg

DB_URL = os.environ['DATABASE_URL'].replace('postgresql+psycopg://', 'postgresql://')
LLM_URL = 'http://localhost:8000/v1/chat/completions'
LLM_MODEL = 'Nemotron-3-Nano-30B-A3B-Q8_0.gguf'
# Magpie TTS doesn't read numbers well, so pre-convert digits to spoken words before TTS
TRANSLATE_PROMPT = (
    'Please translate numbers to the equivalent words as a speaker would, '
    'for example 1970 is nineteen seventy, and otherwise leave the text as is. '
    'Return only the translated text, no explanation.'
)


def translate(text: str) -> str:
    payload = json.dumps({
        'model': LLM_MODEL,
        'messages': [{'role': 'user', 'content': f'{TRANSLATE_PROMPT}\n\n{text}'}],
        'max_tokens': 2000,
        'temperature': 0.3,
    }).encode()
    req = urllib.request.Request(
        LLM_URL,
        data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read())
    return result['choices'][0]['message'].get('content', '').strip()


def main():
    with psycopg.connect(DB_URL) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, type, narrative_text, caption
                FROM story_items
                WHERE narrative_text IS NOT NULL OR caption IS NOT NULL
                ORDER BY id
            """)
            items = cur.fetchall()

        print(f'Found {len(items)} items to process.')

        updated = 0
        failed = 0
        for item_id, item_type, narrative_text, caption in items:
            source = caption if item_type == 'image_scene' else narrative_text
            if not source or not source.strip():
                print(f'  SKIP {item_id} (no source text)')
                continue

            print(f'  {item_id} [{item_type}]: {source[:60]!r}...', end=' ', flush=True)
            try:
                adjusted = translate(source.strip())
                with conn.cursor() as cur:
                    cur.execute(
                        'UPDATE story_items SET adjusted_text = %s WHERE id = %s',
                        (adjusted, item_id),
                    )
                conn.commit()
                print(f'-> {adjusted[:60]!r}')
                updated += 1
            except Exception as e:
                print(f'FAILED: {e}', file=sys.stderr)
                failed += 1
            time.sleep(0.1)  # small pause between LLM calls

    print(f'\nDone. Updated: {updated}, Failed: {failed}')


if __name__ == '__main__':
    main()
