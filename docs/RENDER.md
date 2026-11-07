# دیپلوی روی Render (پلن Free)

روی Render **به Nginx، systemd، certbot، فایروال، swap و اسکریپت دیپلوی نیازی نیست**. Render TLS را تمام می‌کند، دامنه و گواهی می‌دهد، پروسه را زیر نظر دارد و در هر push خودش دیپلوی می‌کند. کل کار: دو سرویس، یک دیتابیس، چند متغیر.

پوشه‌ی `deploy/` (Nginx و systemd) فقط برای سرور اختصاصی (VPS) است و روی Render بی‌مصرف — این سند جای آن را می‌گیرد.

---

## ۱. معماری روی Render

```
مرورگر ──▶ forooshyar-web.onrender.com   (Next.js، TLS توسط Render)
             └── /api/*  →  forooshyar-api.onrender.com  (NestJS)
                                   └──▶ Render Postgres
```

هر دو سرویس روی `$PORT` و `0.0.0.0` گوش می‌دهند (Render این را از بیرون وصل می‌کند). پنل، `/api/*` را در زمان اجرا به آدرس API پروکسی می‌کند، پس مرورگر فقط یک origin می‌بیند و CORS لازم نیست.

---

## ۲. Build Command و Start Command — و دو دام رایج

روی Render، مرحله‌ی **build** و مرحله‌ی **start** دو چیز جدا هستند و مهم است چه چیزی کجاست:

| سرویس | Build Command | Start Command |
|---|---|---|
| API | `npm ci --include=dev --no-audit --no-fund && npm run build` | `npm run prisma:deploy && node dist/main.js` |
| پنل | `npm ci --include=dev --no-audit --no-fund && npm run build` | `npx next start -p $PORT -H 0.0.0.0` |

**دام ۱ — مهاجرت دیتابیس در build کار نمی‌کند.** اگر `npm run prisma:deploy` را داخل Build Command بگذاری، با `Can't reach database server` یا `failed to resolve host 'dpg-xxxx-a'` شکست می‌خورد. دلیلش این است که شبکه‌ی خصوصی Render و میزبان داخلی دیتابیس **فقط در زمان اجرا** وجود دارند، نه در محیط build. (`preDeployCommand` که جای درست این کار است، در پلن Free پشتیبانی نمی‌شود.)

**دام ۲ — `--include=dev` را جا نینداز.** اگر `NODE_ENV=production` در Environment باشد، `npm ci` بقیه‌ی devDependencies را نصب نمی‌کند و build با `tsc: not found` می‌افتد (و `prisma`/`ts-node` هم برای مهاجرت لازم‌اند).

پس این **غلط** است:

```bash
# ❌ در Build Command
npm ci && npm run build && npm run prisma:deploy
```

و این درست:

```bash
# ✅ Build
npm ci --include=dev --no-audit --no-fund && npm run build
# ✅ Start
npm run prisma:deploy && node dist/main.js
```

مهاجرت در start بی‌خطر است چون `prisma migrate deploy` idempotent است: در هر ری‌استارت (از جمله بیدار شدن پس از خواب) اگر مهاجرتی نمانده باشد، کاری نمی‌کند.

---

## ۳. Health Check — علت خطای `HEAD / 404`

لاگی که داری:

```
{"action":"root.head","method":"HEAD","path":"/","status":404,...,"ip":"127.0.0.1"}
```

این درخواست **از خود Render** است، نه از کاربر: Health Check سرویس روی `/` تنظیم است و API روی `/` روت نداشت، پس ۴۰۴ می‌گرفت. نتیجه: Render سرویس را ناسالم می‌دید و دیپلوی شکست می‌خورد — در حالی که API کاملاً سالم بود.

دو کار انجام شده:

1. **Health Check Path سرویس API را روی `/health` بگذار** (Settings → Health Check Path). پاسخ `200` با `{"status":"ok"}`.
2. کد هم مقاوم شد: API حالا روی `/` هم `200` با `{"service":"forooshyar-api","status":"ok"}` می‌دهد، تا اگر Health Check روی پیش‌فرض `/` بماند هم دیپلوی نمیرد.

برای پنل، Health Check Path را `/login` بگذار (به API وابسته نیست، پس اگر API خواب باشد پنل را سالم نمی‌بیند اما خودش هم پاسخ می‌دهد).

---

## ۴. اگر Blueprint را اعمال می‌کنی

`render.yaml` در ریشه‌ی ریپو هست: Dashboard → **New → Blueprint** → ریپو را انتخاب کن → Apply. دو سرویس و یک دیتابیس ساخته می‌شود.

تنها کاری که خودش نمی‌داند: `API_PROXY_TARGET` سرویس پنل باید آدرس عمومی API باشد. بعد از اولین دیپلوی، مقدارش را در Dashboard بگذار:

```
API_PROXY_TARGET = https://forooshyar-api.onrender.com
```

(بدون اسلش انتهایی. اگر اسلش بگذاری هم کد آن را حذف می‌کند، ولی تمیزتر است.)

---

## ۵. اگر دستی می‌سازی (Dashboard)

### سرویس API

| فیلد | مقدار |
|---|---|
| Type | Web Service · Node |
| Root Directory | `backend` |
| Build Command | `npm ci --include=dev --no-audit --no-fund && npm run build` |
| Start Command | `npm run prisma:deploy && node dist/main.js` |
| Health Check Path | `/health` |
| Region | Frankfurt (نزدیک ایران/آلمان) |

`--include=dev` اجباری است: `tsc` و `prisma` در devDependencies هستند و Render با `NODE_ENV=production` نصب می‌کند؛ بدون آن build با `tsc: not found` می‌افتد.

در Start Command از `npm run prisma:deploy` استفاده شده نه `npx prisma migrate deploy`: این اسکریپت اگر فقط `DB_*` ست شده باشد هم `DATABASE_URL` را می‌سازد (خود `prisma` فقط `DATABASE_URL` را می‌شناسد).

`preDeployCommand` در پلن Free **پشتیبانی نمی‌شود** (Render خطای `pre-deploy command is not supported for free tier services` می‌دهد)، برای همین مهاجرت داخل Start Command است. `prisma migrate deploy` idempotent است، پس هر ری‌استارت بی‌خطر است.

### سرویس پنل

| فیلد | مقدار |
|---|---|
| Root Directory | `frontend` |
| Build Command | `npm ci --include=dev --no-audit --no-fund && npm run build` |
| Start Command | `npx next start -p $PORT -H 0.0.0.0` |
| Health Check Path | `/login` |

---

## ۶. متغیرهای محیطی

### API

| متغیر | مقدار | چرا |
|---|---|---|
| `DATABASE_URL` | از دیتابیس Render (`Internal Database URL`) | اگر `DB_*` کامل ست نشود، API همین را می‌خواند |
| `JWT_SECRET` | `openssl rand -base64 48` یا Generate در Render | کمتر از ۳۲ کاراکتر → برنامه بالا نمی‌آید |
| `HOST` | `0.0.0.0` | با `127.0.0.1` از بیرون دیده نمی‌شود |
| `CORS_ORIGINS` | خالی | پنل هم‌مبدأ است |
| `AUDIT_LOG_READS` | `false` | خواندن‌ها فقط در لاگ |
| `AUDIT_RETENTION_DAYS` | `90` | هرس لاگ |
| `CACHE_ENABLED` | `false` | Redis اختیاری؛ اگر `true` باشد بدون `REDIS_URL` معتبر کرش می‌کند |

> **مهم:** یا `DATABASE_URL` بده، یا **هر پنج** متغیر `DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_NAME` را. اگر فقط یکی دو تا از `DB_*` را ست کنی، برنامه در استارتاپ با خطای اعتبارسنجی بالا نمی‌آید (چون `DB_*` بر `DATABASE_URL` اولویت دارد).

### پنل

| متغیر | مقدار |
|---|---|
| `API_PROXY_TARGET` | `https://forooshyar-api.onrender.com` |
| `NEXT_PUBLIC_API_BASE_URL` | **خالی** |
| `NODE_OPTIONS` | `--max-old-space-size=384` |

`NEXT_PUBLIC_API_BASE_URL` را خالی بگذار: مرورگر باید فقط با origin خودش حرف بزند. اگر آن را به دامنه‌ی API ست کنی، CORS و توکن بین دو دامنه وارد بازی می‌شود و خطاهای عجیب می‌گیری.

---

## ۷. خطای `404` روی ورود — چه بود و چه شد

در لاگ خودت مسیر `//auth/login` آمده (دو اسلش). دلیلش این بود که `NEXT_PUBLIC_API_BASE_URL` با **اسلش انتهایی** ست شده بود (`https://...onrender.com/`) و کلاینت مسیر را به `//auth/login` تبدیل می‌کرد؛ Express آن را یک مسیر متفاوت می‌بیند و ۴۰۴ می‌دهد.

سه لایه‌ی دفاع که اضافه شد:

1. `frontend/lib/api.ts` — **همه‌ی** اسلش‌های انتهایی حذف می‌شوند (`replace(/\/+$/, '')`). مقدار بدون `http(s)://` هم دیگر بی‌صدا خراب نمی‌کند.
2. `frontend/app/api/[...path]/route.ts` — بخش‌های خالی مسیر فیلتر می‌شوند، پس `/api//auth/login` هم به `/auth/login` می‌رسد؛ `API_PROXY_TARGET` با اسلش انتهایی هم پذیرفته می‌شود.
3. پروکسی حالا به‌جای ۵۰۰ بی‌پیام، **۵۰۳ با پیام فارسی** می‌دهد و اگر API خواب باشد می‌گوید «سرور در حال بیدار شدن است».

**کاری که تو می‌کنی:** در سرویس پنل، `NEXT_PUBLIC_API_BASE_URL` را **پاک کن (خالی)** و `API_PROXY_TARGET` را بگذار روی آدرس API. بعد **rebuild** کن — این متغیر در زمان build داخل جاوااسکریپت مرورگر قفل می‌شود، پس فقط ری‌استارت کافی نیست.

اگر می‌خواهی همین حالا تشخیص بدهی کدام حالت است، در کنسول مرورگر (F12 → Network) آدرس درخواست لاگین را ببین:

- `.../api/auth/login` → درست است.
- `...//auth/login` یا `...onrender.com//auth/login` → همان مشکل بالا.
- `.../api/auth/login` ولی ۴۰۴ → مشکل سمت API است (`API_PROXY_TARGET` غلط)؛ در لاگ Render سرویس پنل باید خط `[api-proxy] ... unreachable` ببینی.

---

## ۸. محدودیت‌های پلن Free (صادقانه)

| محدودیت | اثر روی فروشیار | راه‌حل |
|---|---|---|
| خواب بعد از ۱۵ دقیقه بی‌کاری، ~۱ دقیقه برای بیدار شدن | اولین کلیک بعد از مدتی طول می‌کشد؛ پروکسی تایم‌اوت ۴۵ ثانیه دارد | pinger مثل UptimeRobot هر ۱۰ دقیقه `/health` را بزند، یا پلن ۷ دلاری |
| ۵۱۲MB رم، ۰٫۱ CPU | Next build ممکن است نزدیک سقف باشد؛ `NODE_OPTIONS` تنظیم شده | build را روی پلن بالاتر بزن یا رم را زیاد کن |
| Postgres Free: ۱GB، **بکاپ ندارد**، ۳۰ روز بعد منقضی می‌شود و ۱۴ روز بعد داده‌اش پاک می‌شود | داده‌ی فروشگاه واقعی در خطر است | بکاپ دستی دوره‌ای با `pg_dump` از URL خارجی، یا دیتابیس Free دیگر (Neon/Supabase) و پلن پولیشده |
| فایل‌سیستم موقتی | هیچ فایلی روی دیسک نگه نمی‌داریم، پس مشکلی نیست | — |
| ۷۵۰ ساعت اینستانس در ماه برای کل workspace | دو سرویس همیشه‌بیدار کمتر از این مصرف می‌کنند؛ ولی اگر مصرف تمام شود هر دو سرویس تا ماه بعد تعلیق می‌شوند | مصرف را در Dashboard ببین |
| بدون کارگر/کرون در Free | هرس لاگ (۰۳:۲۰) اجرا نمی‌شود | با یک Cron Job پولی یا اجرای دستی `npm run audit:prune` |

هیچ‌کدام از این‌ها برای «دمو و تست» مشکل‌ساز نیست؛ برای فروشگاه واقعی، حداقل پلن ۷ دلاری سرویس + دیتابیس پولی (یا Neon) لازم است.

---

## ۹. بکاپ دیتابیس روی Render

```bash
# از URL خارجی دیتابیس استفاده کن (External Database URL → با sslmode)
pg_dump "postgresql://user:pass@host:5432/forooshyar?sslmode=require" -Fc \
  | gzip -9 > forooshyar-$(date +%Y%m%d-%H%M).dump.gz
```

بازگردانی:

```bash
gunzip -c forooshyar-….dump.gz | pg_restore --clean --no-owner -d "postgresql://…?sslmode=require"
```

---

## ۱۰. چک‌لیست بعد از دیپلوی

```
1) https://forooshyar-api.onrender.com/health        → {"status":"ok"}
2) https://forooshyar-web.onrender.com/login         → صفحه‌ی ورود با وزیرمتن
3) ثبت‌نام در پنل                                     → وارد داشبورد می‌شود
4) F12 → Network → درخواست‌ها همه زیر /api/… باشند
5) Render → سرویس API → Logs                         → ردیف‌های {"kind":"audit"} دیده شوند
```

---

## ۱۱. عیب‌یابی سریع

| نشانه | علت | کار |
|---|---|---|
| `tsc: not found` در build | `NODE_ENV=production` و `npm ci` بدون dev | `npm ci --include=dev` |
| build با `Can't reach database server` / `failed to resolve host dpg-…` | مهاجرت داخل Build Command است | مهاجرت را به Start Command ببر |
| لاگ: `root.head` / `HEAD /` با ۴۰۴ | Health Check روی `/` | Health Check Path = `/health` (کد هم اکنون روی `/` جواب ۲۰۰ می‌دهد) |
| دیپلوی «unhealthy» می‌شود ولی سرویس دستی باز می‌شود | همان Health Check | همان بالا |
| `pre-deploy command is not supported for free tier services` | preDeployCommand در Free ممنوع | مهاجرت در Start Command (همان `render.yaml`) |
| برنامه بالا نمی‌آید، خطای zod روی `DB_*` | فقط بخشی از `DB_*` ست شده | `DB_*` را کامل پر کن یا همه را پاک کن و `DATABASE_URL` بده |
| `Can't reach database server` | `DB_HOST=localhost` | از `DATABASE_URL` داخلی Render استفاده کن |
| ورود ۴۰۴، مسیر `//auth/...` | `NEXT_PUBLIC_API_BASE_URL` با اسلش | خالی‌اش کن و rebuild |
| ورود ۵۰۳ «سرور در حال بیدار شدن» | سرویس خواب بوده | یک دقیقه صبر و تلاش دوباره |
| پنل باز است ولی همه‌ی داده‌ها خالی | `API_PROXY_TARGET` غلط | لاگ سرویس پنل: `[api-proxy]` |
| `503` بعد از تغییر پورت/سرویس API | `API_PROXY_TARGET` را عوض نکردی | فقط ری‌استارت پنل کافی است (زمان اجرا خوانده می‌شود) |
