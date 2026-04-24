#!/usr/bin/env bash
# Backup di AIUCD: DB MariaDB (mysqldump) + uploads (tar.gz).
# Pensato per girare via cron sul server di produzione (dhpasteur)
# OPPURE invocato dal workflow check-updates.yml prima di un upgrade.
# Rotazione: mantiene gli ultimi RETENTION_DAYS file per categoria.
#
# Uso:
#   backup-daily.sh                       # label=daily
#   backup-daily.sh --label pre_update    # label=pre_update
#
# Variabili sovrascrivibili da env:
#   COMPOSE_DIR         dove vive docker-compose.yml
#   AIUCD_BACKUPS_DIR   destinazione dump
#   AIUCD_UPLOADS_DIR   sorgente uploads da archiviare
#   RETENTION_DAYS      giorni di retention (NON applicato a label != "daily")
#
# Exit code != 0 se uno dei due backup fallisce.

set -euo pipefail

LABEL="daily"
while [ $# -gt 0 ]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

COMPOSE_DIR="${COMPOSE_DIR:-/home/dhpasteur/actions-runner/_work/aiucd/aiucd}"
AIUCD_BACKUPS_DIR="${AIUCD_BACKUPS_DIR:-/home/dhpasteur/aiucd-data/backups}"
AIUCD_UPLOADS_DIR="${AIUCD_UPLOADS_DIR:-/home/dhpasteur/aiucd-data/uploads}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

TS="$(date +%Y%m%d_%H%M%S)"
DB_DUMP="$AIUCD_BACKUPS_DIR/db_${LABEL}_${TS}.sql.gz"
FILES_DUMP="$AIUCD_BACKUPS_DIR/uploads_${LABEL}_${TS}.tar.gz"

log() { printf '[%(%F %T)T] %s\n' -1 "$*"; }

mkdir -p "$AIUCD_BACKUPS_DIR"

log "=== AIUCD backup START label=$LABEL ==="
log "compose_dir=$COMPOSE_DIR backups_dir=$AIUCD_BACKUPS_DIR uploads_dir=$AIUCD_UPLOADS_DIR retention=${RETENTION_DAYS}d"

# --- DB ---
DB_OK=1
if [ ! -d "$COMPOSE_DIR" ]; then
  log "ERROR: compose dir not found: $COMPOSE_DIR"
  DB_OK=0
else
  cd "$COMPOSE_DIR"
  if ! docker compose ps 2>/dev/null | grep -q "Up"; then
    log "ERROR: containers not running, skipping DB dump"
    DB_OK=0
  else
    log "Dumping wordpress DB to $DB_DUMP"
    if docker compose exec -T db sh -c \
        'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --quick --lock-tables=false --routines --triggers --events --default-character-set=utf8mb4 wordpress' \
        2>/dev/null | gzip > "$DB_DUMP" \
       && [ -s "$DB_DUMP" ]; then
      log "OK DB backup: $(du -h "$DB_DUMP" | cut -f1)"
    else
      rm -f "$DB_DUMP"
      log "ERROR: DB dump failed"
      DB_OK=0
    fi
  fi
fi

# --- Uploads ---
FILES_OK=1
if [ ! -d "$AIUCD_UPLOADS_DIR" ]; then
  log "ERROR: uploads dir not found: $AIUCD_UPLOADS_DIR"
  FILES_OK=0
else
  log "Archiving uploads to $FILES_DUMP"
  if tar -czf "$FILES_DUMP" -C "$(dirname "$AIUCD_UPLOADS_DIR")" "$(basename "$AIUCD_UPLOADS_DIR")" \
     && [ -s "$FILES_DUMP" ]; then
    log "OK uploads backup: $(du -h "$FILES_DUMP" | cut -f1)"
  else
    rm -f "$FILES_DUMP"
    log "ERROR: uploads tar failed"
    FILES_OK=0
  fi
fi

# --- Rotation (solo per la categoria 'daily') ---
if [ "$LABEL" = "daily" ]; then
  log "Rotating daily files older than ${RETENTION_DAYS} days..."
  find "$AIUCD_BACKUPS_DIR" -maxdepth 1 -type f \
    \( -name 'db_daily_*.sql.gz' -o -name 'uploads_daily_*.tar.gz' \) \
    -mtime "+${RETENTION_DAYS}" -print -delete | sed 's/^/  removed: /' || true
fi

REMAINING_DB=$(find "$AIUCD_BACKUPS_DIR" -maxdepth 1 -name "db_${LABEL}_*.sql.gz" | wc -l)
REMAINING_FILES=$(find "$AIUCD_BACKUPS_DIR" -maxdepth 1 -name "uploads_${LABEL}_*.tar.gz" | wc -l)
log "Retained '$LABEL': $REMAINING_DB DB dumps, $REMAINING_FILES uploads archives"

log "=== AIUCD backup END label=$LABEL (db_ok=$DB_OK files_ok=$FILES_OK) ==="

# Stampa il path dei dump appena creati cosi' i caller (es. workflow update)
# possono parsarli e citarli nel body della PR.
if [ "$DB_OK" = 1 ] && [ "$FILES_OK" = 1 ]; then
  echo "BACKUP_DB_PATH=$DB_DUMP"
  echo "BACKUP_FILES_PATH=$FILES_DUMP"
fi

if [ "$DB_OK" = 1 ] && [ "$FILES_OK" = 1 ]; then
  exit 0
else
  exit 1
fi
