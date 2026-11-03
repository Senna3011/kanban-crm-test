#!/bin/bash
#
# Setup script for Kanban CRM database backup cron job
# Run once on the production server:
#   chmod +x /opt/kanban-crm/scripts/setup-backup-cron.sh
#   sudo /opt/kanban-crm/scripts/setup-backup-cron.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="$SCRIPT_DIR/backup.sh"
BACKUP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/backups"
CRON_SCHEDULE="0 2 * * *"
CRON_JOB="$CRON_SCHEDULE $BACKUP_SCRIPT >> $BACKUP_DIR/backup.log 2>&1"

# Ensure backup script is executable
chmod +x "$BACKUP_SCRIPT"

# Create backups directory
mkdir -p "$BACKUP_DIR"

# Add cron job if not already present
if crontab -l 2>/dev/null | grep -qF "$BACKUP_SCRIPT"; then
  echo "Cron job already exists for $BACKUP_SCRIPT"
else
  (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
  echo "Cron job added: $CRON_JOB"
fi

# Verify cron job
echo ""
echo "Current cron jobs:"
crontab -l
echo ""
echo "Setup complete. Backup will run daily at 2:00 AM."
echo "Logs: /opt/kanban-crm/backups/backup.log"
