#!/usr/bin/env bash
# فروشیار — اسکریپت دیپلوی
#
#   ./deploy/deploy.sh            # pull + build + migrate + restart
#   ./deploy/deploy.sh --no-pull  # فقط build و restart (بعد از یک rollback دستی)
#
# روی سرور، با کاربری که دسترسی sudo برای systemctl دارد اجرا شود:
#   sudo -u forooshyar ./deploy/deploy.sh
#
# فرض: کد در /srv/forooshyar است و سرویس‌های forooshyar-api / forooshyar-web
# نصب شده‌اند (deploy/systemd/).

set -Eeuo pipefail

APP_DIR="${APP_DIR:-/srv/forooshyar}"
BRANCH="${BRANCH:-develop}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/health}"
PULL=1
[[ "${1:-}" == "--no-pull" ]] && PULL=0

log()  { printf '\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m!!! %s\033[0m\n' "$*" >&2; exit 1; }

cd "$APP_DIR"

# ---------------------------------------------------------------- 0. pre-flight
log "pre-flight"
command -v node >/dev/null || fail "node نصب نیست (Node.js 20+)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
(( NODE_MAJOR >= 20 )) || fail "Node.js نسخه $NODE_MAJOR است؛ حداقل 20 لازم است"
[[ -f /etc/forooshyar/api.env ]] || fail "/etc/forooshyar/api.env موجود نیست"
[[ -f /etc/forooshyar/web.env ]] || fail "/etc/forooshyar/web.env موجود نیست"

# ------------------------------------------------------------------- 1. backup
if [[ "${SKIP_BACKUP:-0}" == "1" ]]; then
  log "backup رد شد (SKIP_BACKUP=1)"
elif command -v pg_dump >/dev/null; then
  log "backup دیتابیس قبل از مهاجرت"
  "$APP_DIR/deploy/backup-db.sh" || fail "backup شکست خورد — دیپلوی متوقف شد"
else
  # روی دیتابیس مدیریت‌شده معمولاً pg_dump کلاینت نصب نیست؛ بکاپ خودکار همان سرویس جای آن را می‌گیرد
  log "pg_dump پیدا نشد؛ backup رد شد — بکاپ سرویس دیتابیس را چک کن"
fi

# --------------------------------------------------------------------- 2. code
if (( PULL )); then
  log "دریافت کد از origin/$BRANCH"
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  # اگر تغییر لوکال داری، عمداً متوقف می‌شویم تا کسی سورپرایز نشود
  [[ -z "$(git status --porcelain)" ]] || fail "درخت کاری تمیز نیست؛ اول تغییرات لوکال را حل کن"
  git merge --ff-only "origin/$BRANCH"
fi
COMMIT="$(git rev-parse --short HEAD)"
log "کد روی $COMMIT"

# ------------------------------------------------------------------ 3. backend
log "backend: نصب دپندنسی‌ها"
cd "$APP_DIR/backend"
npm ci --omit=dev --no-audit --no-fund
# prisma و ts-node برای migrate/prune لازم‌اند و در devDependencies نیستند
npm install --no-save --no-audit --no-fund prisma@5 ts-node@10 typescript@5
npx prisma generate

log "backend: مهاجرت دیتابیس"
set -a; . /etc/forooshyar/api.env; set +a
# prisma فقط DATABASE_URL را می‌شناسد، ولی ما DB_* را ست می‌کنیم → از db-url.js بساز
export DATABASE_URL="$(node "$APP_DIR/deploy/db-url.js")"
npx prisma migrate deploy

log "backend: build"
npm run build

# ----------------------------------------------------------------- 4. frontend
log "frontend: نصب دپندنسی‌ها و build"
cd "$APP_DIR/frontend"
npm ci --no-audit --no-fund
set -a; . /etc/forooshyar/web.env; set +a
npm run build

# ------------------------------------------------------------------ 5. restart
log "restart سرویس‌ها"
sudo systemctl restart forooshyar-api
# فرصت بده بالا بیاید، بعد وب را ری‌استارت کن (وب به API پروکسی می‌کند)
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null --max-time 2 "$HEALTH_URL"; then break; fi
  sleep 1
done
curl -fsS -o /dev/null --max-time 3 "$HEALTH_URL" || fail "API بالا نیامد — journalctl -u forooshyar-api -n 100"
sudo systemctl restart forooshyar-web

# ------------------------------------------------------------------- 6. verify
log "بررسی نهایی"
sleep 2
curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:3000/" || fail "پنل بالا نیامد — journalctl -u forooshyar-web -n 100"
curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1:3000/api/health" || fail "پروکسی /api کار نمی‌کند"

log "✅ دیپلوی $COMMIT با موفقیت انجام شد"
log "وضعیت:  systemctl status forooshyar-api forooshyar-web"
log "لاگ‌ها:  journalctl -u forooshyar-api -f --output=cat | jq -c 'select(.kind==\"audit\")'"
