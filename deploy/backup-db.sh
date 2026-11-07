#!/usr/bin/env bash
# بکاپ دیتابیس فروشیار با نگه‌داری ۱۴ روز.
#   BACKUP_DIR=/var/backups/forooshyar DB_NAME=forooshyar PGHOST=127.0.0.1 ./deploy/backup-db.sh
# در /etc/forooshyar/backup.env (chmod 600, فقط root/postgres) این‌ها را بگذار:
#   PGHOST=127.0.0.1 PGUSER=forooshyar PGPASSWORD=... DB_NAME=forooshyar
#   BACKUP_DIR=/var/backups/forooshyar RETENTION_DAYS=14
set -Eeuo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/forooshyar}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DB_NAME="${DB_NAME:-forooshyar}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/${DB_NAME}-${STAMP}.dump.gz"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# -Fc فشرده و قابل restore انتخابی است؛ gzip هم برای صرفه‌جویی
pg_dump -Fc --no-owner --no-privileges "$DB_NAME" | gzip -9 > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"

# بررسی اینکه فایل واقعاً سالم و غیرخالی است
SIZE=$(stat -c%s "$FILE")
[[ "$SIZE" -gt 1024 ]] || { echo "backup شبیه فایل خالی است: $FILE" >&2; exit 1; }
gzip -t "$FILE"

find "$BACKUP_DIR" -name "${DB_NAME}-*.dump.gz" -type f -mtime "+${RETENTION_DAYS}" -delete

echo "backup: $FILE ($(numfmt --to=iec <<<"$SIZE"))"
