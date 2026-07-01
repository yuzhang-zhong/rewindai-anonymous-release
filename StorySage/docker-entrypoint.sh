#!/bin/bash
set -e

# Add the current directory and source tree to PYTHONPATH.
export PYTHONPATH=/app:/app/src:$PYTHONPATH
export DATA_DIR="${DATA_DIR:-/app/data}"
export LOGS_DIR="${LOGS_DIR:-/app/logs}"
export DATABASE_URL="${DATABASE_URL:-sqlite:///${DATA_DIR}/interview_app.db}"
export PORT="${PORT:-8000}"
export STORYSAGE_AUTO_SETUP_DB="${STORYSAGE_AUTO_SETUP_DB:-true}"

mkdir -p "$DATA_DIR" "$LOGS_DIR"

if [ "$STORYSAGE_AUTO_SETUP_DB" = "true" ] || [ "$STORYSAGE_AUTO_SETUP_DB" = "1" ]; then
  echo "Setting up database..."
  python src/main.py --mode setup_db
else
  echo "Skipping database setup because STORYSAGE_AUTO_SETUP_DB=$STORYSAGE_AUTO_SETUP_DB"
fi

# Start the server
echo "Starting server..."
exec uvicorn src.api.app:app --host 0.0.0.0 --port "$PORT" --proxy-headers
