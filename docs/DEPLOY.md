# راهنمای دیپلوی فروشیار روی سرور

این سند برای وضعیت واقعی تو نوشته شده: **Ubuntu 22.04/24.04**، **دیتابیس مدیریت‌شده** (Neon/Supabase/RDS یا مشابه)، **دامنه داری ولی Nginx هنوز نصب نیست**. همه‌ی دستورها با فرض دامنه‌ی `example.com` نوشته شده‌اند — جای آن دامنه‌ی خودت را بگذار.

> **قبل از هر چیز:** رکورد DNS دامنه (A برای دامنه و `www`) را به IP سرور بده و صبر کن propagate شود. certbot بدون آن گواهی نمی‌دهد، و بدون گواهی هیچ‌کدام از مراحل HTTPS کار نمی‌کند.

فایل‌های آماده در [`deploy/`](../deploy):

```
deploy/nginx/forooshyar.conf              کانفیگ کامل Nginx (TLS، gzip، rate limit، هدرهای امنیتی)
deploy/nginx/forooshyar-bootstrap.conf    کانفیگ موقت برای گرفتن گواهی قبل از فعال‌سازی TLS
deploy/nginx/security-headers.conf        snippet هدرهای امنیتی (باید در /etc/nginx/snippets کپی شود)
deploy/systemd/*.service, *.timer         سرویس‌های API/پنل + prune لاگ + backup
deploy/env/*.env.example                  الگوی متغیرهای محیطی (api / web / backup)
deploy/db-url.js                          ساخت DATABASE_URL از DB_* برای prisma migrate
deploy/deploy.sh                          دیپلوی با یک دستور
deploy/backup-db.sh, restore-db.sh        بکاپ و بازگردانی دیتابیس
```

---

## ۰. معماری روی سرور

```
اینترنت ──▶ Nginx (443) ──┬─▶ Next.js  127.0.0.1:3000   پنل + /api پروکسی
                          └─▶ NestJS   127.0.0.1:3001   API
                                   └──▶ PostgreSQL مدیریت‌شده (TLS، اینترنت)
```

هر دو اپ فقط روی **loopback** گوش می‌دهند؛ تنها Nginx از بیرون دیده می‌شود. دیتابیس روی سرور نیست (سرویس مدیریت‌شده)، پس رمز و آدرس آن فقط در `/etc/forooshyar/api.env` زندگی می‌کند و باید `DB_SSL_MODE=verify-full` باشد. پنل، `/api/*` را در همان مبدأ به API پروکسی می‌کند، پس در مرورگر هیچ آدرس APIای وجود ندارد و CORS لازم نیست.

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

## ۳. دیتابیس مدیریت‌شده

روی همان سرویس (Neon/Supabase/RDS) این‌ها را بردار:

1. **connection string** (حالت pooled اگر پیشنهاد می‌شود — Neon `-pooler`، Supabase port 6543).
2. **CA certificate** اگر `verify-full` می‌خواهی.
3. مطمئن شو **IP سرور در allowlist** سرویس دیتابیس است (اکثرشان پیش‌فرض همه‌چیز را می‌بندند).

نصب کلاینت برای مهاجرت و بکاپ دستی هم لازم است:

```bash
sudo apt-get install -y postgresql-client
psql "$(sudo -u forooshyar bash -c 'set -a; . /etc/forooshyar/api.env; set +a; node /srv/forooshyar/deploy/db-url.js')" -c 'select version();'
```

اگر این تست جواب نداد، مسئله دیتابیس است و هیچ مرحله‌ی بعدی درست کار نمی‌کند.

> **دو دام که ما را واقعاً زمین زد:**
> - `DB_HOST=localhost` → Node نام را اول به `::1` (IPv6) تبدیل می‌کند و اگر دیتابیس فقط IPv4 بپذیرد، API با `Can't reach database server` بالا نمی‌آید. از هاست یا IP مشخص استفاده کن.
> - `prisma migrate deploy` فقط `DATABASE_URL` را می‌شناسد، در حالی که API آدرس را از `DB_*` می‌سازد. اگر روی سرور فقط `DB_*` را ست کنی، مهاجرت با `Environment variable not found: DATABASE_URL` شکست می‌خورد. `deploy/db-url.js` دقیقاً برای همین نوشته شده و در `deploy.sh` صدا زده می‌شود.

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
| `DB_SSL_MODE` | **`verify-full`** (دیتابیس مدیریت‌شده، ترافیک از اینترنت می‌رود) — `require` فقط اگر CA در اختیار نبود، `disable` هرگز |
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

`DATABASE_URL` را دستی ست نکن: `deploy.sh` آن را از `DB_*` می‌سازد.

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

چون دیتابیس مدیریت‌شده است، `After=postgresql.service` در یونیت API فقط یک وابستگی بی‌ضرر است (روی سرور Postgres نصب نیست)؛ مشکل ایجاد نمی‌کند. اگر خواستی پاکش کنی، `systemctl daemon-reload` یادت نرود.

هر دو سرویس با `Restart=always`، محدودیت ری‌استارت حلقه‌ای (`StartLimitBurst`)، و سخت‌سازی systemd (`ProtectSystem=strict`, `NoNewPrivileges`, `PrivateTmp`, `MemoryMax`) تنظیم شده‌اند.

---

## ۷. Nginx و TLS

```bash
sudo apt-get install -y nginx
```

**مرحله ۱ — اول گواهی، بعد کانفیگ اصلی.** کانفیگ اصلی به فایل گواهی اشاره می‌کند؛ اگر قبل از گرفتن گواهی فعالش کنی `nginx -t` شکست می‌خورد و Nginx بالا نمی‌آید (مرغ و تخم‌مرغ). پس موقتاً کانفیگ bootstrap را بگذار:

```bash
sudo mkdir -p /var/www/certbot
sudo cp /srv/forooshyar/deploy/nginx/forooshyar-bootstrap.conf /etc/nginx/sites-available/forooshyar
sudo sed -i 's/example.com/دامنه/g' /etc/nginx/sites-available/forooshyar    # یا با nano
sudo ln -sf /etc/nginx/sites-available/forooshyar /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# فقط گواهی بگیر (هنوز Nginx را دست نمی‌زند)
sudo apt-get install -y certbot
sudo certbot certonly --webroot -w /var/www/certbot \
  -d example.com -d www.example.com --agree-tos -m ایمیل@تو
```

**مرحله ۲ — کانفیگ اصلی:** (سه فایل، به همین ترتیب)

```bash
# ۱) هدرهای امنیتی — بدون این، nginx -t با «include file not found» شکست می‌خورد
sudo mkdir -p /etc/nginx/snippets
sudo cp /srv/forooshyar/deploy/nginx/security-headers.conf \
        /etc/nginx/snippets/forooshyar-security-headers.conf

# ۲) سایت
sudo cp /srv/forooshyar/deploy/nginx/forooshyar.conf /etc/nginx/sites-available/forooshyar
sudo sed -i 's/example.com/دامنه/g' /etc/nginx/sites-available/forooshyar

# ۳) تست و بارگذاری
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run      # تمدید خودکار تست شود
```

اگر `example.com` را با `sed` عوض کردی، مسیر `ssl_certificate` هم درست می‌شود (هر دو جا از همان دامنه استفاده می‌کنند). بعد از این مرحله `http://` باید به `https://` ریدایرکت شود و `https://دامنه/api/health` باید `{"status":"ok"}` بدهد.

> **دو نکته‌ی نسخه که خودمان به آن‌ها خوردیم:**
> - دستور `http2 on;` فقط در nginx ≥ ۱٫۲۵٫۱ وجود دارد. Ubuntu 22.04 نسخه‌ی 1.18 و 24.04 نسخه‌ی 1.24 دارد، پس کانفیگ از پارامتر `listen 443 ssl http2;` استفاده می‌کند که همه‌جا کار می‌کند (روی نسخه‌های جدید فقط یک warning می‌دهد؛ می‌توانی بعداً به `http2 on;` تغییرش بدهی).
> - در nginx، اگر یک `location` حتی یک `add_header` داشته باشد، **همه‌ی** `add_header`های سطح `server` برای آن location از بین می‌روند (ارث‌بری all-or-nothing). برای همین هدرهای امنیتی در فایل جدا هستند و در هر locationی که `add_header` دارد دوباره include می‌شوند — وگرنه صفحه‌ی اصلی پنل بی‌سروصدا HSTS و X-Frame-Options را از دست می‌داد.

کانفیگ شامل این‌هاست: ریدایرکت HTTP→HTTPS، HSTS، `X-Content-Type-Options`، `X-Frame-Options`، `Referrer-Policy`، `Permissions-Policy`، gzip، `client_max_body_size 4m` (سقف آپلود CSV/XLSX در API ۲ مگابایت است)، کش طولانی برای `/_next/static` و `/fonts`، **بدون کش** برای صفحات پنل، و rate-limit روی `/api/auth/*`.

> **دو نکته‌ی نسخه که خودمان به آن‌ها خوردیم:**
> - دستور `http2 on;` فقط در nginx ≥ ۱٫۲۵٫۱ وجود دارد. Ubuntu 22.04 نسخه‌ی 1.18 و 24.04 نسخه‌ی 1.24 دارد، پس کانفیگ از پارامتر `listen 443 ssl http2;` استفاده می‌کند که همه‌جا کار می‌کند (روی نسخه‌های جدید فقط یک warning می‌دهد؛ می‌توانی بعداً به `http2 on;` تغییرش بدهی).
> - در nginx، اگر یک `location` حتی یک `add_header` داشته باشد، **همه‌ی** `add_header`های سطح `server` برای آن location از بین می‌روند (ارث‌بری all-or-nothing). برای همین هدرهای امنیتی در فایل جدا هستند و در هر locationی که `add_header` دارد دوباره include می‌شوند — وگرنه صفحه‌ی اصلی پنل بی‌سروصدا HSTS و X-Frame-Options را از دست می‌داد.

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
sudo ss -tlnp | grep -E ':(3000|3001|80|443)'
# 3000/3001 → 127.0.0.1   |   80/443 → 0.0.0.0
# پورت ۵۴۳۲ نباید روی سرور باز باشد؛ دیتابیس جای دیگری است.
```

---

## ۹. بکاپ و نگه‌داری

با دیتابیس مدیریت‌شده، **بکاپ اولیه را خود سرویس می‌دهد** — اول از همه این را در پنلش فعال کن (Neon: Point-in-time restore / Supabase: Daily backups / RDS: automated backups + retention ≥ ۷ روز).

بکاپ مستقل خودمان هم ارزش دارد (مثلاً برای انتقال یا بازگردانی به نسخه‌ای خاص):

```bash
sudo cp /srv/forooshyar/deploy/env/backup.env.example /etc/forooshyar/backup.env
sudo nano /etc/forooshyar/backup.env          # PGHOST/PGUSER/PGPASSWORD از سرویس دیتابیس
sudo chown root:root /etc/forooshyar/backup.env
sudo chmod 600 /etc/forooshyar/backup.env
sudo -u postgres /srv/forooshyar/deploy/backup-db.sh     # یک بار دستی تست کن
```

اگر `pg_dump` روی سرور نیست یا نمی‌خواهی بکاپ لوکال داشته باشی، تایمر بکاپ را فعال نکن و در عوض بکاپ سرویس دیتابیس را جدی بگیر. `deploy.sh` هم در این حالت با `SKIP_BACKUP=1` جلو می‌رود و فقط هشدار می‌دهد.

تایمر هرس لاگ (۰۳:۲۰) مستقل از این است و باید فعال باشد.

> بکاپ روی همان دیسک، بکاپ نیست. یک `rclone`/`scp` به فضای بیرونی اضافه کن.

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

## ۱۲. قرارداد پاسخ‌ها و خطاها

همه‌ی پاسخ‌های خطا یک شکل دارند تا پنل بتواند یک‌جا نمایششان بدهد:

```json
{ "statusCode": 401, "message": "ایمیل یا رمز عبور نادرست است.", "requestId": "…", "path": "/auth/login" }
```

| وضعیت | پیام | کجا تولید می‌شود |
|---|---|---|
| ۴۰۰ | «بدنه‌ی درخواست معتبر نیست؛ قالب JSON را بررسی کنید.» | body-parser (JSON خراب) |
| ۴۰۰ | `fieldErrors` با نام فیلد اشتباه | اعتبارسنجی zod |
| ۴۰۱ | «ایمیل یا رمز عبور نادرست است.» | ورود ناموفق |
| ۴۰۹ | «این ایمیل قبلاً ثبت شده است.» | ثبت‌نام تکراری |
| ۴۱۳ | «حجم درخواست بیش از حد مجاز است.» | سقف ۶۴KB برای JSON، ۲MB برای فایل |
| ۴۲۹ | «تعداد درخواست‌ها زیاد بود؛ چند لحظه بعد دوباره تلاش کنید.» | Throttler خود API و rate-limit Nginx |

`requestId` هم در پاسخ و هم در ردیف `AuditLog` و هم در journal هست؛ با آن می‌شود یک درخواست کاربر را دقیقاً ردیابی کرد. Nginx برای ۴۲۹های خودش هم همان قالب JSON را برمی‌گرداند (نه صفحه‌ی HTML پیش‌فرض) به‌همراه هدر `Retry-After`.

---

## ۱۳. کارهایی که هنوز **نباید** انتظارشان را داشته باشی

این پیام‌ها و محدودیت‌ها در `README.md` هم آمده‌اند؛ برای اینکه در دیپلوی غافلگیر نشوی:

- اتصال واقعی به تلگرام/اینستاگرام پیاده نشده؛ «دستیار پاسخ‌گو» فعلاً **پیش‌نمایش deterministic** است.
- هیچ صف/worker پس‌زمینه‌ای وجود ندارد؛ همه‌چیز در فرایند API است.
- Rate limit روی حافظه‌ی همان پروسه است؛ با چند instance پشت load balancer، سهمیه‌ها جدا می‌شوند (Redis لازم می‌شود).
- Redis اختیاری است و `CACHE_ENABLED=true` بدون `REDIS_URL` معتبر، در startup خطا می‌دهد.
- هنوز تست بار/نفوذ انجام نشده.

---

## ۱۴. خرابی‌های رایج و علت واقعی‌شان

| نشانه | علت | راه‌حل |
|---|---|---|
| API بالا نمی‌آید، لاگ: `Can't reach database server` | `DB_HOST=localhost` و resolve شدن به `::1` | `DB_HOST=127.0.0.1` |
| `Environment variable not found: DATABASE_URL` موقع `migrate deploy` | فقط `DB_*` ست شده | `export DATABASE_URL="$(node deploy/db-url.js)"` — یا از `deploy.sh` استفاده کن |
| `nginx -t` خطای `open() … forooshyar-security-headers.conf failed` | فایل snippet کپی نشده | `cp deploy/nginx/security-headers.conf /etc/nginx/snippets/forooshyar-security-headers.conf` |
| `nginx -t` خطای `unknown directive "http2"` | nginx قدیمی‌تر از ۱٫۲۵٫۱ | کانفیگ فعلی از `listen 443 ssl http2;` استفاده می‌کند؛ اگر خودت عوضش کردی، برگردان |
| لاگین/ثبت‌نام هنگام صدا زدن از دامنه ۴۰۴ می‌دهد | پیشوند `/api` حذف نشده | location مربوط به `auth` باید `rewrite ^/api/(.*)$ /$1 break;` داشته باشد |
| پاسخ ۴۲۹ به‌صورت صفحه‌ی HTML می‌آید | `limit_req_status` تنظیم نشده یا `error_page` نیست | از کانفیگ همین ریپو استفاده کن |
| `nginx -t` خطای `cannot load certificate` | کانفیگ TLS قبل از گرفتن گواهی فعال شده | با `forooshyar-bootstrap.conf` اول گواهی بگیر، بعد کانفیگ اصلی |
| certbot خطای `Timeout during connect` | DNS به سرور اشاره نمی‌کند یا پورت ۸۰ بسته است | `dig +short دامنه` و `ufw status` |
| `PrismaClientInitializationError` بعد از دیپلوی | `prisma generate` اجرا نشده | در `deploy.sh` هست؛ دستی: `npx prisma generate` |
| `/api/*` خطای ۵۰۳/۵۰۰ می‌دهد، پنل باز است | `API_PROXY_TARGET` غلط یا API خواب | `EnvironmentFile` را چک کن، `systemctl status forooshyar-api` |
| فونت‌ها لود نمی‌شوند / متن انگلیسی می‌شود | `/fonts/*` بلاک شده یا Nginx آن لوکیشن را ندارد | کانفیگ `deploy/nginx` را کامل کپی کن |
| ثبت‌نام ۵۰۰ می‌دهد ولی بقیه کار می‌کند | جدول `AuditLog` ساخته نشده | `npx prisma migrate deploy` |
| build نکست OOM می‌شود | RAM کم | swap + `NODE_OPTIONS=--max-old-space-size=1024` |
| کوکی/توکن بعد از رفرش پاک می‌شود | پنل و API روی دو دامنه | با همین معماری هم‌مبدأ (`/api`) نگه دار |
| خطای ۴۱۳ روی آپلود | فایل > ۴MB در Nginx | `client_max_body_size`؛ خود API سقف ۲MB دارد |

---

## ۱۵. پیوست: چه چیزهایی روی build واقعی تست شد

این کیت فقط روی کاغذ نوشته نشده. کل زنجیره (Postgres → Nest با `node dist/main.js` → Next با `next start` → nginx با همین کانفیگ) یک‌بار کامل بالا آمد و این‌ها با curl بررسی شدند:

| بررسی | نتیجه |
|---|---|
| `http → https` | ۳۰۱ به همان مسیر |
| صفحه‌ی پنل `/app`، `/login` | ۲۰۰ |
| هدر امنیتی روی `/` و `/api/*` | HSTS + X-Frame + X-Content-Type + Referrer-Policy + Permissions-Policy |
| `cache-control` | `no-store` روی صفحات، `immutable` روی `/_next/static` و `/fonts` |
| `GET /api/health`، `GET /healthz` | ۲۰۰ `{"status":"ok"}` |
| ثبت‌نام از مسیر `/api/auth/register` | ۲۰۱ + توکن |
| ورود با رمز غلط | ۴۰۱ با پیام فارسی |
| ثبت‌نام تکراری | ۴۰۹ با پیام فارسی |
| `/api/products` بدون توکن | ۴۰۱ |
| ساخت محصول، گزارش، فروشگاه، پیش‌نمایش ربات | ۲۰۱/۲۰۰ |
| آپلود CSV (multipart) | ۲۰۱ `{"imported":1}` |
| JSON خراب | ۴۰۰ با پیام فارسی و `requestId` |
| بدنه‌ی ۷۰ کیلوبایتی | ۴۱۳ با پیام فارسی |
| مسیر ناموجود | ۴۰۴ (پاسخ API دست‌نخورده رد می‌شود) |
| ۱۴ تلاش ورود پشت‌سرهم | ۴۲۹ با بدنه‌ی JSON فارسی + `Retry-After: 60` |
| نوشتن audit در دیتابیس | همه‌ی درخواست‌ها ثبت شد، صفر خطای نوشتن |
| `npm test` | ۲۲/۲۲ |
| `nginx -t` | موفق روی nginx 1.26 |
| `prisma migrate deploy` با URL ساخته‌شده از `DB_*` | موفق |

