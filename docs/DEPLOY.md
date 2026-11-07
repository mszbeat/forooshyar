# راهنمای دیپلوی فروشیار روی سرور

این سند فرض می‌کند پروژه روی یک **سرور لینوکس (Ubuntu 22.04/24.04 یا Debian 12)** رفته و می‌خواهی بدون نقص بالا بیاید. همه‌ی دستورها با فرض دامنه‌ی `example.com` نوشته شده‌اند — جای آن دامنه‌ی خودت را بگذار.

فایل‌های آماده در [`deploy/`](../deploy):

```
deploy/nginx/forooshyar.conf          کانفیگ کامل Nginx (TLS، gzip، rate limit، هدرهای امنیتی)
deploy/systemd/*.service, *.timer     سرویس‌های API/پنل + prune لاگ + backup
deploy/env/*.env.example              الگوی متغیرهای محیطی
deploy/deploy.sh                      دیپلوی با یک دستور (+ رول‌بک خودکار در شکست)
deploy/backup-db.sh, restore-db.sh    بکاپ و بازگردانی دیتابیس
```

---

## ۰. معماری روی سرور

```
اینترنت ──▶ Nginx (443) ──┬─▶ Next.js  127.0.0.1:3000   پنل + /api پروکسی
                          └─▶ NestJS   127.0.0.1:3001   API
                                   └──▶ PostgreSQL 5432 (فقط لوکال)
```

هر دو اپ فقط روی **loopback** گوش می‌دهند؛ تنها Nginx از بیرون دیده می‌شود. پنل، `/api/*` را در همان مبدأ به API پروکسی می‌کند، پس در مرورگر هیچ آدرس APIای وجود ندارد و CORS لازم نیست.

---

## ۱. پیش‌نیازها

| مورد | حداقل | چرا |
|---|---|---|
| CPU / RAM | ۲ vCPU / **۲GB** | build نکست روی ۱GB معمولاً OOM می‌شود |
| دیسک | ۲۰GB | node_modules + بکاپ‌ها |
| Node.js | **۲۰ LTS** | Next 15 و Nest 10 |
| PostgreSQL | ۱۴+ | از `gen_random_uuid` و ایندکس‌های بولی استفاده می‌شود |
| Nginx | ۱.۲۲+ | `http2 on` |

```bash
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

sudo apt-get install -y postgresql nginx git curl ufw
node -v   # باید v20.x باشد
```

اگر build روی سرور کوچک شکست خورد، `NODE_OPTIONS=--max-old-space-size=1024` و یک swap ۲ گیگی:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## ۲. کاربر و مسیر

هرگز با root اجرا نکن.

```bash
sudo adduser --system --group --home /srv/forooshyar forooshyar
sudo mkdir -p /srv/forooshyar /etc/forooshyar /var/backups/forooshyar
sudo chown -R forooshyar:forooshyar /srv/forooshyar /var/backups/forooshyar
sudo chmod 700 /etc/forooshyar

# کد را (با همان کلید دیپلوی) بگیر
sudo -u forooshyar git clone -b develop git@github.com:mszbeat/forooshyar.git /srv/forooshyar
# اگر ریپو قبلاً آنجاست:
#   cd /srv/forooshyar && git fetch origin && git checkout develop && git reset --hard origin/develop
```

---

## ۳. دیتابیس

```bash
sudo -u postgres psql <<'SQL'
CREATE USER forooshyar WITH PASSWORD 'رمز-قوی-اینجا';
CREATE DATABASE forooshyar OWNER forooshyar;
REVOKE ALL ON DATABASE forooshyar FROM PUBLIC;
SQL
```

Postgres پیش‌فرض روی `127.0.0.1` گوش می‌دهد — همین درست است. از بیرون بازش نکن.

> **نکته‌ای که واقعاً سرور را زمین می‌زند:** در متغیرها `127.0.0.1` بنویس، نه `localhost`. Node 18+ نام `localhost` را اول به `::1` (IPv6) تبدیل می‌کند و اگر Postgres فقط روی IPv4 گوش بدهد، API با `Can't reach database server` بالا نمی‌آید — دقیقاً همین در تست ما رخ داد.

---

## ۴. متغیرهای محیطی

```bash
sudo cp /srv/forooshyar/deploy/env/api.env.example /etc/forooshyar/api.env
sudo cp /srv/forooshyar/deploy/env/web.env.example /etc/forooshyar/web.env
sudo chown forooshyar:forooshyar /etc/forooshyar/*.env
sudo chmod 600 /etc/forooshyar/*.env

# JWT_SECRET را تولید و جای‌گذاری کن
openssl rand -base64 48
sudo nano /etc/forooshyar/api.env
```

مقادیر حیاتی:

| متغیر | مقدار production |
|---|---|
| `HOST` | `127.0.0.1` (اگر Docker/K8s: `0.0.0.0`) |
| `PORT` | `3001` |
| `DB_HOST` | `127.0.0.1` — **نه** `localhost` |
| `DB_SSL_MODE` | `disable` روی همان سرور؛ `verify-full` برای دیتابیس مدیریت‌شده |
| `JWT_SECRET` | `openssl rand -base64 48` — هرگز پیش‌فرض |
| `CORS_ORIGINS` | خالی (هم‌مبدأ). اگر پنل روی دامنه‌ی دیگری است: `https://panel.example.com` |
| `API_PROXY_TARGET` | `http://127.0.0.1:3001` |
| `AUDIT_LOG_READS` | `false` (خواندن‌ها فقط در journal) |
| `AUDIT_RETENTION_DAYS` | `90` |

---

## ۵. نصب و build

```bash
cd /srv/forooshyar/backend
sudo -u forooshyar npm ci --omit=dev
sudo -u forooshyar npm install --no-save prisma@5 ts-node@10 typescript@5  # برای migrate و prune
sudo -u forooshyar npx prisma generate
sudo -u forooshyar npx prisma migrate deploy      # ← schema + جدول AuditLog
sudo -u forooshyar npm run build                  # → dist/

cd /srv/forooshyar/frontend
sudo -u forooshyar npm ci
sudo -u forooshyar npm run build                  # → .next/
```

مقدار `API_PROXY_TARGET` را **قبل از build** لازم نیست ست کنی؛ پروکسی در Next به‌صورت runtime پیاده شده (`app/api/[...path]/route.ts`)، پس با تغییر پورت API فقط ری‌استارت لازم است، نه rebuild. (این قبلاً با `rewrites()` در next.config انجام می‌شد و مقدار داخل build قفل می‌شد — یعنی تغییر پورت بی‌صدا `/api` را می‌شکست.)

---

## ۶. سرویس‌های systemd

```bash
sudo cp /srv/forooshyar/deploy/systemd/*.service /srv/forooshyar/deploy/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now forooshyar-api forooshyar-web
sudo systemctl enable --now forooshyar-audit-prune.timer forooshyar-backup.timer

systemctl status forooshyar-api forooshyar-web --no-pager
curl -s http://127.0.0.1:3001/health   # {"status":"ok"}
curl -s http://127.0.0.1:3000/api/health
```

هر دو سرویس با `Restart=always`، محدودیت ری‌استارت حلقه‌ای (`StartLimitBurst`)، و سخت‌سازی systemd (`ProtectSystem=strict`, `NoNewPrivileges`, `PrivateTmp`, `MemoryMax`) تنظیم شده‌اند.

---

## ۷. Nginx و TLS

```bash
sudo cp /srv/forooshyar/deploy/nginx/forooshyar.conf /etc/nginx/sites-available/forooshyar
sudo sed -i 's/example.com/دامنه/دامنه/g' /etc/nginx/sites-available/forooshyar   # یا با nano ویرایش کن
sudo ln -sf /etc/nginx/sites-available/forooshyar /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# گواهی
sudo apt-get install -y certbot python3-certbot-nginx
sudo mkdir -p /var/www/certbot
sudo certbot --nginx -d example.com -d www.example.com --redirect
sudo certbot renew --dry-run      # تمدید خودکار تست شود
```

کانفیگ شامل این‌هاست: ریدایرکت HTTP→HTTPS، HSTS، `X-Content-Type-Options`، `X-Frame-Options`، `Referrer-Policy`، `Permissions-Policy`، gzip، `client_max_body_size 4m` (سقف آپلود CSV/XLSX در API ۲ مگابایت است)، کش طولانی برای `/_next/static` و `/fonts`، **بدون کش** برای صفحات پنل، و rate-limit روی `/api/auth/*`.

---

## ۸. فایروال و شبکه

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

پورت‌های ۳۰۰۰ و ۳۰۰۱ نباید از بیرون باز باشند. بررسی:

```bash
sudo ss -tlnp | grep -E ':(3000|3001|5432|80|443)'
# 3000/3001/5432 → 127.0.0.1   |   80/443 → 0.0.0.0
```

---

## ۹. بکاپ و نگه‌داری

```bash
sudo cp /srv/forooshyar/deploy/env/backup.env.example /etc/forooshyar/backup.env
sudo nano /etc/forooshyar/backup.env          # رمز دیتابیس را بگذار
sudo chown root:root /etc/forooshyar/backup.env
sudo chmod 600 /etc/forooshyar/backup.env
sudo -u postgres /srv/forooshyar/deploy/backup-db.sh     # یک بار دستی تست کن
```

تایمرها: بکاپ روزانه ۰۲:۱۰، هرس لاگ ۰۳:۲۰.

> بکاپ روی همان دیسک، بکاپ نیست. یک `rclone`/`scp` به فضای بیرونی اضافه کن.

---

## ۱۰. چک‌لیست بعد از دیپلوی

```bash
# ۱) سلامت سرویس‌ها
systemctl is-active forooshyar-api forooshyar-web
curl -s https://example.com/api/health

# ۲) ثبت‌نام و ورود واقعی با مرورگر
#    https://example.com/login  →  ساخت فروشگاه

# ۳) فونت‌ها و استایل‌ها لود می‌شوند؟ (وزیرمتن از /fonts)
curl -sI https://example.com/fonts/Vazirmatn-Light.woff2 | head -3

# ۴) لاگ‌ها ثبت می‌شوند؟ (بعد از یک ثبت‌نام)
sudo -u postgres psql -d forooshyar -c \
  'select action, method, "statusCode", success, "createdAt" from "AuditLog" order by "createdAt" desc limit 10;'

# ۵) لاگ زنده
journalctl -u forooshyar-api -f --output=cat | grep '"kind":"audit"'

# ۶) خطاها
journalctl -u forooshyar-api -u forooshyar-web -p warning --since '1 hour ago'
```

---

## ۱۱. به‌روزرسانی نسخه

```bash
cd /srv/forooshyar
sudo -u forooshyar ./deploy/deploy.sh
```

اسکریپت به‌ترتیب: بررسی نسخه‌ی Node و فایل‌های env → **بکاپ دیتابیس** (اگر شکست بخورد، متوقف می‌شود) → `git fetch` و `ff-only merge` → `npm ci` + `prisma generate` + `migrate deploy` + `build` → ری‌استارت API و انتظار برای `/health` → ری‌استارت پنل → بررسی `/` و `/api/health`.

### رول‌بک

```bash
cd /srv/forooshyar
git log --oneline -5                    # کامیت سالم قبلی را پیدا کن
git reset --hard <commit>
sudo -u forooshyar ./deploy/deploy.sh --no-pull
```

اگر مهاجرت دیتابیس مشکل‌ساز بود:

```bash
sudo -u postgres /srv/forooshyar/deploy/restore-db.sh /var/backups/forooshyar/forooshyar-….dump.gz
```

---

## ۱۲. کارهایی که هنوز **نباید** انتظارشان را داشته باشی

این پیام‌ها و محدودیت‌ها در `README.md` هم آمده‌اند؛ برای اینکه در دیپلوی غافلگیر نشوی:

- اتصال واقعی به تلگرام/اینستاگرام پیاده نشده؛ «دستیار پاسخ‌گو» فعلاً **پیش‌نمایش deterministic** است.
- هیچ صف/worker پس‌زمینه‌ای وجود ندارد؛ همه‌چیز در فرایند API است.
- Rate limit روی حافظه‌ی همان پروسه است؛ با چند instance پشت load balancer، سهمیه‌ها جدا می‌شوند (Redis لازم می‌شود).
- Redis اختیاری است و `CACHE_ENABLED=true` بدون `REDIS_URL` معتبر، در startup خطا می‌دهد.
- هنوز تست بار/نفوذ انجام نشده.

---

## ۱۳. خرابی‌های رایج و علت واقعی‌شان

| نشانه | علت | راه‌حل |
|---|---|---|
| API بالا نمی‌آید، لاگ: `Can't reach database server` | `DB_HOST=localhost` و resolve شدن به `::1` | `DB_HOST=127.0.0.1` |
| `PrismaClientInitializationError` بعد از دیپلوی | `prisma generate` اجرا نشده | در `deploy.sh` هست؛ دستی: `npx prisma generate` |
| `/api/*` خطای ۵۰۳/۵۰۰ می‌دهد، پنل باز است | `API_PROXY_TARGET` غلط یا API خواب | `EnvironmentFile` را چک کن، `systemctl status forooshyar-api` |
| فونت‌ها لود نمی‌شوند / متن انگلیسی می‌شود | `/fonts/*` بلاک شده یا Nginx آن لوکیشن را ندارد | کانفیگ `deploy/nginx` را کامل کپی کن |
| ثبت‌نام ۵۰۰ می‌دهد ولی بقیه کار می‌کند | جدول `AuditLog` ساخته نشده | `npx prisma migrate deploy` |
| build نکست OOM می‌شود | RAM کم | swap + `NODE_OPTIONS=--max-old-space-size=1024` |
| کوکی/توکن بعد از رفرش پاک می‌شود | پنل و API روی دو دامنه | با همین معماری هم‌مبدأ (`/api`) نگه دار |
| خطای ۴۱۳ روی آپلود | فایل > ۴MB در Nginx | `client_max_body_size`؛ خود API سقف ۲MB دارد |
