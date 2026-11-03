#!/bin/bash
#
# PostgreSQL Backup Script for Kanban CRM
# Supports direct connection via DATABASE_URL (Supabase/Cloud) or local PostgreSQL/Docker
#
# Usage:
#   chmod +x scripts/backup.sh
#   ./scripts/backup.sh
#
# Cron job (daily at 2 AM):
#   0 2 * * * /path/to/kanban-crm/scripts/backup.sh >> /path/to/kanban-crm/backups/backup.log 2>&1
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_PREFIX="[kanban-crm-backup]"

# --- Check required tools ---
if ! command -v pg_dump >/dev/null 2>&1; then
  echo "$LOG_PREFIX ERROR: 'pg_dump' is not installed or not in PATH."
  echo "$LOG_PREFIX Install postgresql client on Linux: 'sudo apt update && sudo apt install -y postgresql-client'"
  exit 1
fi

if ! command -v gzip >/dev/null 2>&1; then
  echo "$LOG_PREFIX ERROR: 'gzip' is not installed or not in PATH."
  exit 1
fi

# --- Load DATABASE_URL from .env or .env.local if not already in environment ---
DATABASE_URL="${DATABASE_URL:-}"

if [ -z "$DATABASE_URL" ] && command -v node >/dev/null 2>&1; then
  DATABASE_URL=$(node -e '
    const fs = require("fs");
    const path = require("path");
    const root = process.argv[1];
    for (const f of [".env", ".env.local"]) {
      const p = path.join(root, f);
      if (fs.existsSync(p)) {
        const lines = fs.readFileSync(p, "utf8").split("\n");
        for (const line of lines) {
          if (line.trim().startsWith("DATABASE_URL=")) {
            let val = line.trim().substring("DATABASE_URL=".length).trim();
            if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("\x27") && val.endsWith("\x27"))) {
              val = val.substring(1, val.length - 1);
            }
            console.log(val);
            process.exit(0);
          }
        }
      }
    }
  ' "$ROOT_DIR" 2>/dev/null || true)
fi

# Fallback basic grep if node unavailable
if [ -z "$DATABASE_URL" ]; then
  for f in "${ROOT_DIR}/.env" "${ROOT_DIR}/.env.local"; do
    if [ -f "$f" ]; then
      val=$(grep -E '^DATABASE_URL=' "$f" | head -n 1 | sed -E 's/^DATABASE_URL=["'"'"']?([^"'"'"']+)["'"'"']?/\1/' | tr -d '\r')
      if [ -n "$val" ]; then
        DATABASE_URL="$val"
        break
      fi
    fi
  done
fi

# --- Target Backup File ---
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"
RETENTION_DAYS=7
DATE=$(date +%Y-%m-%d_%H%M%S)
DB_LABEL="kanban-crm"
if [ -n "$DATABASE_URL" ]; then
  DB_LABEL="supabase-cloud"
fi
BACKUP_FILE="${BACKUP_DIR}/${DB_LABEL}_${DATE}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "$LOG_PREFIX Starting database backup at $(date)"

# --- Execute pg_dump ---
DUMP_ERR=$(mktemp)
if [ -n "$DATABASE_URL" ]; then
  echo "$LOG_PREFIX Connecting via DATABASE_URL from application config..."
  if ! pg_dump --dbname="$DATABASE_URL" --format=plain --no-owner --no-privileges 2>"$DUMP_ERR" | gzip > "$BACKUP_FILE"; then
    ERR_TEXT=$(cat "$DUMP_ERR" 2>/dev/null || true)
    rm -f "$DUMP_ERR"
    if echo "$ERR_TEXT" | grep -qi "server version mismatch"; then
      echo "$LOG_PREFIX Version mismatch detected: Supabase menggunakan PostgreSQL 17, sedangkan pg_dump lokal versi 16."
      if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
        echo "$LOG_PREFIX Mencoba backup otomatis via container Docker postgres:17..."
        docker run --rm -i postgres:17 pg_dump --dbname="$DATABASE_URL" --format=plain --no-owner --no-privileges | gzip > "$BACKUP_FILE"
      else
        echo "$LOG_PREFIX SOLUSI: Jalankan perintah ini di VPS untuk mengupgrade pg_dump ke versi 17:"
        echo "  sudo install -d /etc/apt/keyrings"
        echo "  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg"
        echo "  echo \"deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt \$(lsb_release -cs)-pgdg main\" | sudo tee /etc/apt/sources.list.d/pgdg.list"
        echo "  sudo apt update && sudo apt install -y postgresql-client-17"
        rm -f "$BACKUP_FILE"
        exit 1
      fi
    else
      echo "$LOG_PREFIX ERROR running pg_dump: $ERR_TEXT"
      rm -f "$BACKUP_FILE"
      exit 1
    fi
  fi
  rm -f "$DUMP_ERR"
else
  DB_NAME="${POSTGRES_DB:-kanban-crm}"
  DB_USER="${POSTGRES_USER:-kanban}"
  DB_HOST="${DB_HOST:-localhost}"
  DB_PORT="${DB_PORT:-5433}"
  PGPASSWORD="${POSTGRES_PASSWORD:-kanban123}"
  export PGPASSWORD

  echo "$LOG_PREFIX Connecting to local database '$DB_NAME' at $DB_HOST:$DB_PORT (user: $DB_USER)..."
  pg_dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --format=plain \
    --no-owner \
    --no-privileges \
    | gzip > "$BACKUP_FILE"
fi

# --- Verify backup was created and is non-empty ---
if [ ! -s "$BACKUP_FILE" ]; then
  echo "$LOG_PREFIX ERROR: Backup file is empty or missing: $BACKUP_FILE"
  exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "$LOG_PREFIX Backup successfully created: $BACKUP_FILE ($BACKUP_SIZE)"

# --- Delete backups older than RETENTION_DAYS ---
DELETED=$(find "$BACKUP_DIR" -name "*.sql.gz" -mtime +${RETENTION_DAYS} -print -delete 2>/dev/null | wc -l || true)
if [ "$DELETED" -gt 0 ]; then
  echo "$LOG_PREFIX Cleaned up $DELETED old backup(s) older than $RETENTION_DAYS days"
fi

TOTAL=$(find "$BACKUP_DIR" -name "*.sql.gz" 2>/dev/null | wc -l || true)
echo "$LOG_PREFIX Total backups retained: $TOTAL"
echo "$LOG_PREFIX Backup completed successfully at $(date)"
