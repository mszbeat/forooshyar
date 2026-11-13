# Forooshyar (فروش‌یار)

A Persian-first sales assistant in development. The repository contains two **separately installable and deployable** Node.js applications:

```text
backend/        NestJS API, PostgreSQL migrations, tests and .env.example
catalogs/       Ready-to-import demo catalog files (CSV/XLSX) and their generator
frontend/       Next.js seller panel and .env.example
examples/       Example catalog CSV
PROJECT_PLAN.md Phased roadmap and task IDs
ARCHITECTURE.md Target design and known limitations
```

Both directories have their own `package.json`, lockfile and environment file. See [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md) for independent instructions. No Docker is used.

Deployment:
- **Render (PaaS, the current target):** [`docs/RENDER.md`](docs/RENDER.md) and [`render.yaml`](render.yaml). Two web services + Postgres, no Nginx/systemd — Render terminates TLS and routes `$PORT`.
- **Bare VPS:** [`docs/DEPLOY.md`](docs/DEPLOY.md) and [`deploy/`](deploy) (Nginx, systemd units, backup scripts).

Telegram is documented separately: [`docs/TELEGRAM.md`](docs/TELEGRAM.md) (shared bot, customer auto-replies from real stock, seller sale/low-stock notifications, webhook setup).

Orders taken inside the bot — disambiguation by buttons, forwarded-post detection,
step-by-step checkout, payment link, and the panel page — are in
[`docs/ORDERS.md`](docs/ORDERS.md).

Customer conversations and the customer book — the Telegram chat seen from inside
the panel, with seller replies sent through the same bot and deep links from
notifications — are in [`docs/CONVERSATIONS.md`](docs/CONVERSATIONS.md).

Platform-wide settings — AI model + key, bot token, payment gateway, database URL and
system flags — live in a separate **admin panel** at `/admin` (`docs/ADMIN.md`). It uses its
own account table and token namespace, so an admin session never grants shop data and a
seller token never reaches `/admin/*`.

**Database pooling (Supabase/pooler):** runtime uses the **transaction pooler**
(port 6543) via `DATABASE_URL=...:6543/postgres?pgbouncer=true&connection_limit=5`;
migrations use `DIRECT_URL` (direct/session connection, port 5432). The admin overview
runs queries sequentially with a 30s cache and retry-on-transient-error, and never shows
raw Prisma/SQL text in the UI — only friendly Persian messages with a retry button.
Create the admin account with `ADMIN_SEED_EMAIL` / `ADMIN_SEED_PASSWORD` (min 12 chars)
via `npm run prisma:seed-admin`; the account gets `mustChangePassword=true` and must
change its password on first login. No credentials are stored in code.

In both cases the panel talks to the API through its own same-origin `/api` proxy: leave frontend `NEXT_PUBLIC_API_BASE_URL` **empty** and point `API_PROXY_TARGET` at the API. Trailing slashes in either variable are stripped, because a trailing slash used to produce `//auth/login` and a 404.

## Current implementation and important limitations

This is **not a completed or production-ready product**. Current features: owner registration/login, catalog and variant management, atomic stock ledger (sales, restock, manual adjustment, idempotent sales), CSV/XLSX import with per-row errors, a deterministic Persian reply preview (Fresh), shop-scoped dashboard/report endpoints (`/reports/summary`, `/reports/attention`) and a **complete seller panel**: landing page, login/registration, dashboard, product & stock management with per-variant ledger history, catalog import, assistant sandbox and shop settings. The panel is Persian/RTL, responsive down to small phones, self-hosts its font and talks to the API through a same-origin `/api` proxy. Optional Redis cache exists but is not used by the catalog. Real Telegram delivery, queue workers, OpenRouter, seller notifications, conversations, post recognition, full security hardening and production deployment remain unfinished. The Fresh preview is not a bot and must not be used as one. See the roadmap for status.

The backend currently uses **Prisma**, not the requested TypeORM configuration. `ConfigModule` and separate `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` variables were added, but migrating all existing database access and migrations to TypeORM remains undone. Do not interpret this change as a TypeORM migration. Existing Prisma migrations remain the source of schema changes, and automatic schema synchronization is not enabled. Before database changes back up your data.

Price and stock are read from PostgreSQL, stock movements are transactional, and every protected query is intended to be shop-scoped. Tests cover selected isolation and concurrency scenarios, not an exhaustive security proof. Never commit secrets.

## Try it locally (five minutes)

```sh
# 1. backend
cd backend && npm ci
cp .env.example .env      # set DB_* and JWT_SECRET
npm run prisma:deploy     # apply migrations to an existing empty PostgreSQL database
npm run build && npm run dev          # http://localhost:3001

# 2. demo data (optional, idempotent) — creates demo@forooshyar.ir / forooshyar-demo-1404
node scripts/seed-demo.mjs

# 3. frontend
cd ../frontend && npm ci
cp .env.example .env.local            # API_PROXY_TARGET=http://127.0.0.1:3001
npm run dev                           # http://localhost:3000
```

The demo script only writes through the public API, so it can never create
inconsistent stock: every sale and restock goes through the same transactional
ledger the panel uses.

## Prompt v4

- ماسکات شناور پایین-چپ در پنل (`FloatingMascot`)؛ در گفتگوها مخفی است تا composer پوشیده نشود.
- اکانت‌ها: فروشنده فقط پلتفرم را انتخاب و اجازه می‌دهد؛ جزئیات فنی (webhook/امضا/لاگ) فقط در `/admin/integrations`.
- مشتریان: `/app/customers` جدا از گفتگوها؛ یادداشت و برچسب در localStorage مرورگر نگه داشته می‌شود.
- واریانت‌ها: سقف ۱۰۰ ترکیب؛ SKU خودکار از کد محصول؛ ایمپورت با ستون `کد` + `attribute_N/value_N`؛ قیمت «توافقی» یعنی قیمت درخواستی (۰).
- لینک پست: در ویرایش محصول، لینک پست/ریل اینستاگرام را اضافه کنید تا کامنت روی آن پست، اطلاعات همان محصول را در DM بفرستد.
- سبد بات: بعد از انتخاب واریانت، «ثبت سفارش» یا «افزودن محصول جدید»؛ اینستاگرام با عدد ۱/۲ کار می‌کند.
- پلن‌ها: رایگان/پرو/اولترا/مکس/اختصاصی از دیتابیس؛ سقف پاسخ AI در داشبورد نمایش داده می‌شود.
- ورود ادمین: فقط `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` (seed در هر استارتاپ).

## Feedback round 2

- بله/روبیکا: بات مشترک؛ توکن و سکرت webhook فقط از env (`BALE_BOT_TOKEN`/`BALE_WEBHOOK_SECRET`/`RUBIKA_BOT_TOKEN`/`RUBIKA_WEBHOOK_SECRET`) یا پنل ادمین ← «پیام‌رسان‌های ایرانی» تنظیم می‌شود. فروشنده فقط اتصال را فعال می‌کند و توکن وارد نمی‌کند (بک‌اند هم `secret` را برای این دو پلتفرم رد می‌کند). webhookها: `/bale/webhook/:secret` و `/rubika/webhook/:secret`؛ مسیریابی به فروشگاه با `/start <code>`.
- واریانت‌ها: مودال «واریانت از ویژگی‌ها» حالا پیش‌نویس مرتب با قیمت/موجودی قابل‌ویرایش برای هر ردیف نشان می‌دهد و با «ثبت وارینت‌ها» (`POST /products/:id/variants/batch`) همه را یک‌جا ثبت می‌کند؛ ترکیب موجود با همان مقادیر به‌روز می‌شود.
- ماسکات: در لوگو فقط صورت (`robot-face.png`) و در صفحه نسخه‌ی کامل؛ پلک‌زدن با `.robot-eyelid` روی چشم‌های نورانی.

## Feedback round 6

- پیامک sms.ir: کلید (`SMS_API_KEY`)، خط فرستنده (`SMS_SENDER_NUMBER`) و قالب OTP (`SMS_OTP_TEMPLATE_ID`) از env یا پنل ادمین ← «پیامک و OTP». بدون کلید، حالت Mock (فقط لاگ) حفظ می‌شود. OTP با `POST /v1/send/verify` و پیامک عادی با `POST /v1/send/bulk` ارسال می‌شود.
- ثبت‌نام با OTP: شماره موبایل اختیاری در فرم ثبت‌نام با کد یک‌بارمصرف تأیید می‌شود و پس از ساخت حساب، پیامک خوش‌آمد ارسال می‌شود.
- پیامک سفارش opt-in با هزینه‌ی اضافه: هنگام خرید پلن می‌توان فعالش کرد (`orderSmsMonthlyPrice` روی پلن، ادمین قابل تنظیم) یا بعداً از تنظیمات ← «اعلان پیامکی سفارش» خرید و فعال کرد (بدون تمدید اشتراک). تاگل روشن/خاموش در همان بخش است. پس از خرید پلن/افزودنی هم پیامک اطلاع به فروشنده می‌رسد.
- ناظر شارژ موجودی: مشتری‌ای که «خبرم کن» زده بود، هنگام شارژ از همان کانالش (تلگرام/اینستاگرام/بله/روبیکا) خبر می‌شود.
- لینک فروشگاه بله/روبیکا مثل تلگرام در کارت اکانت نمایش داده می‌شود (`BALE_BOT_USERNAME`/`RUBIKA_BOT_USERNAME`).
