#!/bin/bash
# =============================================================================
# Entrypoint for Hugging Face Spaces
# Handles persistent storage symlinks and database initialization
# =============================================================================

set -e

echo "============================================"
echo "  Reele Video Engine - HF Spaces Startup"
echo "============================================"

# ─── Set up persistent storage ────────────────────────────────────────────────
# HF Spaces mounts persistent storage at /data
# We ensure our data directories exist there and are accessible

echo "[Startup] Setting up persistent storage..."

# Ensure persistent directories exist
mkdir -p /data/upload /data/db

# If there's an existing DB in the app dir and none in /data, copy it over
if [ -f /app/db/custom.db ] && [ ! -f /data/db/custom.db ]; then
    echo "[Startup] Copying existing database to persistent storage..."
    cp /app/db/custom.db /data/db/custom.db
fi

# If there are existing uploads in the app dir and none in /data, copy them
if [ "$(ls -A /app/upload 2>/dev/null)" ] && [ ! "$(ls -A /data/upload 2>/dev/null)" ]; then
    echo "[Startup] Copying existing uploads to persistent storage..."
    cp -r /app/upload/* /data/upload/ 2>/dev/null || true
fi

# Set correct permissions
echo "[Startup] Setting permissions..."
chown -R user:user /data/upload /data/db 2>/dev/null || true

echo "[Startup] Persistent storage ready:"
echo "  - Database: /data/db/custom.db"
echo "  - Uploads:  /data/upload/"

# ─── Initialize database ──────────────────────────────────────────────────────
echo "[Startup] Initializing database schema..."
npx prisma db push --accept-data-loss

# ─── Start Next.js ────────────────────────────────────────────────────────────
echo "[Startup] Starting Next.js on port ${PORT:-7860}..."
exec npx next start -p ${PORT:-7860}
