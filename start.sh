#!/usr/bin/env zsh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

"$SCRIPT_DIR/.venv/bin/python" "$SCRIPT_DIR/scripts/build_frontend.py"

echo "Starting SwaraTube Studio (Flute & Piano YouTube Trainer) on http://127.0.0.1:8000 ..."
exec "$SCRIPT_DIR/.venv/bin/uvicorn" backend.app:app --host 127.0.0.1 --port 8000
