#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

export PYTHONPATH="$SCRIPT_DIR"

echo "→ Applying migrations..."
flask --app run:app db upgrade

echo "→ Starting Flask on http://localhost:5000 ..."
python3 run.py
