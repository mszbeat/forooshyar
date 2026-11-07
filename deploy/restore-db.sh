#!/usr/bin/env bash
# بازگردانی بکاپ — با احتیاط: دیتابیس موجود پاک می‌شود.
#   ./deploy/restore-db.sh /var/backups/forooshyar/forooshyar-20261107-021000.dump.gz
set -Eeuo pipefail
FILE="${1:?مسیر فایل بکاپ لازم است}"
DB_NAME="${DB_NAME:-forooshyar}"

read -r -p "این کار دیتابیس «$DB_NAME» را بازنویسی می‌کند. ادامه؟ (yes) " ANSWER
[[ "$ANSWER" == "yes" ]] || exit 1

gzip -t "$FILE"
pg_restore --clean --if-exists --no-owner --no-privileges -d "$DB_NAME" <(gzip -dc "$FILE")
echo "restore تمام شد: $FILE → $DB_NAME"
