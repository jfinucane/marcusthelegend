#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export PYTHONPATH="$SCRIPT_DIR"

echo "→ Applying migrations..."
flask --app run:app db upgrade

# Threads rather than processes: nearly every slow request is blocked on an
# outbound call (Gemini, Kokoro), not on CPU. Chat sessions live in the DB
# (story.chat_history), so no worker affinity is required.
echo "→ Starting gunicorn on 0.0.0.0:5000 ..."
exec gunicorn \
    --bind 0.0.0.0:5000 \
    --workers 2 \
    --threads 8 \
    --timeout 300 \
    --graceful-timeout 30 \
    --access-logfile - \
    --error-logfile - \
    run:app
