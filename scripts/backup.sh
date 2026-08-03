#!/bin/bash
#
# PostgreSQL Backup Script for Kanban CRM
# Location on production server: /opt/kanban-crm/scripts/backup.sh
#
# Usage:
#   chmod +x /opt/kanban-crm/scripts/backup.sh
#   ./backup.sh
#
# Cron job (daily at 2 AM):
#   0 2 * * * /opt/kanban-crm/scripts/backup.sh >> /opt/kanban-crm/backups/backup.log 2>&1
#

set -euo pipefail

# --- Configuration ---
DB_NAME="kanban-crm"
DB_USER="postgres"
DB_HOST="localhost"
DB_PORT="5432"
BACKUP_DIR="/opt/kanban-crm/backups"
RETENTION_DAYS=7
DATE=$(date +%Y-%m-%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${DATE}.sql.gz"
LOG_PREFIX="[kanban-crm-backup]"

# --- Ensure backup directory exists ---
mkdir -p "$BACKUP_DIR"

echo "$LOG_PREFIX Starting backup of '$DB_NAME' at $(date)"

# --- Run pg_dump and compress ---
pg_dump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  --format=plain \
  --no-owner \
  --no-privileges \
  | gzip > "$BACKUP_FILE"

# --- Verify backup was created and is non-empty ---
if [ ! -s "$BACKUP_FILE" ]; then
  echo "$LOG_PREFIX ERROR: Backup file is empty or missing: $BACKUP_FILE"
  exit 1
fi

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "$LOG_PREFIX Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# --- Delete backups older than RETENTION_DAYS ---
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +${RETENTION_DAYS} -print -delete | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "$LOG_PREFIX Cleaned up $DELETED old backup(s)"
fi

# --- List current backups ---
TOTAL=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" | wc -l)
echo "$LOG_PREFIX Total backups retained: $TOTAL"
echo "$LOG_PREFIX Backup completed successfully at $(date)"
