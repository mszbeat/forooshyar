# لاگ و ردّ فعالیت (Audit Trail)

هر درخواستی که به API می‌رسد — موفق یا ناموفق — ثبت می‌شود. علاوه بر آن، هر عملیات دامنه‌ای (فروش، اصلاح موجودی، ایمپورت، تغییر تنظیمات، ورود/ثبت‌نام) یک رویداد جدا با جزئیات کامل دارد.

## دو لایه، دو هدف

| لایه | چه چیزی ثبت می‌شود | کجا |
|---|---|---|
| **درخواست** (middleware) | هر HTTP request: `method`, `path`, `statusCode`, `durationMs`, `ip`, `userAgent`, `requestId`, `userId`, `shopId` | `AuditLog` + stdout |
| **رویداد** (سرویس‌ها) | معنای واقعی عمل: مقدار قبلی/بعدی موجودی، فیلدهای تغییر‌یافته، نتیجه ایمپورت، دلیل شکست ورود | `AuditLog` + stdout |

چرا middleware و نه interceptor: گاردها (توکن نامعتبر) و هندلر ۴۰۴ **قبل از** interceptor اجرا می‌شوند؛ اگر لاگ در interceptor بود، دقیقاً همان رویدادهایی که بیشتر لازم‌اند (۴۰۱ و ۴۰۴) از دست می‌رفتند. تست شد: هر دو ثبت می‌شوند.

## چه چیزی لاگ می‌شود

**همیشه در جدول** (`AuditLog`):
- همه‌ی `POST` / `PATCH` / `PUT` / `DELETE`
- هر درخواست ناموفق، حتی `GET` (۴۰۱، ۴۰۴، ۴۰۰، ۴۰۹، ۴۲۹، ۵۰۰)
- همه‌ی رویدادهای دامنه‌ای

**فقط در stdout** (مگر `AUDIT_LOG_READS=true`):
- درخواست‌های `GET` موفق — جدول را پر نمی‌کنند ولی برای دیباگ در لاگ سرور هستند.

## اقدام‌های نام‌گذاری‌شده

| action | کِی |
|---|---|
| `auth.register` / `auth.login` / `auth.login_failed` | ثبت‌نام و ورود (دلیل شکست: `unknown_email` / `bad_password` / `no_shop`) |
| `shop.update` | تغییر تنظیمات فروشگاه (فقط نام فیلدها، نه محتوای متن‌ها) |
| `product.create` / `product.update` / `product.archive` | محصول |
| `variant.create` / `variant.update` / `variant.archive` | واریانت |
| `variant.sell` / `variant.sell_replayed` | فروش (با `stockAfter` و `idempotencyKey`) |
| `variant.restock` / `variant.stock_adjust` | شارژ و اصلاح موجودی (با `delta` و `stockAfter`) |
| `catalog.import` | ایمپورت فایل (تعداد ردیف‌ها، موفق/ناموفق، نمونه‌ی خطاها) |
| `product.list` / `audit.read` / `reports.*` | خواندن‌ها |

## امنیت و اندازه

- رمز، توکن، هدر `Authorization`، کوکی و هر کلید حساس دیگر با `[redacted]` جایگزین می‌شوند (`redact()` در `request-context.ts`).
- متن‌های خیلی بلند به ۵۰۰ کاراکتر بریده می‌شوند؛ آرایه‌ها به ۵۰ عضو.
- در لاگ درخواست‌های `PATCH`، فقط **نام** فیلدهای تغییر‌یافته ثبت می‌شود، نه مقدارشان (Shipping و Payment ممکن است اطلاعات حساس داشته باشند).
- نوشتن لاگ هرگز درخواست را نمی‌شکند: insert به‌صورت fire-and-forget است و خطا فقط یک بار (و بعد هر ۵۰ بار) در لاگ سرور دیده می‌شود.

## خروجی خام (stdout)

هر ردیف یک JSON تک‌خطی است، آماده‌ی `journalctl`/Loki/Datadog:

```json
{"ts":"2026-11-07T10:56:12.311Z","level":"info","kind":"audit","requestId":"req_mw6afw3x1k",
 "action":"variant.sell","method":"POST","path":"/variants/…/sell","status":201,"durationMs":12,
 "shopId":"…","userId":"…","entity":"variant","entityId":"…","ip":"1.2.3.4","meta":{"quantity":2,"stockAfter":8}}
```

## خواندن لاگ‌ها از API

```http
GET /audit?action=variant.sell&success=false&limit=50
Authorization: Bearer <token>
```

| پارامتر | توضیح |
|---|---|
| `action` | فیلتر روی نام اقدام |
| `entity` | `product` / `variant` / `shop` / `catalog` / `user` |
| `success` | `true` / `false` |
| `from` / `to` | ISO datetime |
| `limit` | ۱ تا ۲۰۰ (پیش‌فرض ۵۰) |
| `cursor` | شناسه‌ی آخرین ردیف برای صفحه‌بندی |

همیشه به فروشگاه خودِ کاربر محدود است؛ ردیف‌هایی که `shopId` ندارند (ورود ناموفق، مسیر ناشناخته) از این مسیر قابل خواندن نیستند.

```http
GET /audit/actions
```

فهرست اقدام‌های یک فروشگاه با تعدادشان — برای ساختن فیلتر.

## نگه‌داری

جدول Append-only است و فقط باید هرس شود:

```bash
npm run audit:prune        # AUDIT_RETENTION_DAYS (پیش‌فرض ۹۰ روز)
```

پیشنهاد: یک systemd timer یا cron شبانه.

## ساختار داخلی

```
src/logging/
├─ request-context.ts     AsyncLocalStorage + requestId + redact()
├─ logging.middleware.ts  ردیف درخواست (response.on('finish'))
├─ actions.ts             نگاشت route → نام اقدام (تابع خالص و تست‌شده)
├─ audit.service.ts       دو sink: stdout + جدول
├─ audit.controller.ts    GET /audit و GET /audit/actions
├─ logging.module.ts      Global
└─ http-exception.filter.ts  خطای ۵۰۰ با stack + برگرداندن requestId به کلاینت
```

`AuditService` در همه‌ی ماژول‌ها قابل تزریق است:

```ts
this.audit.record({ action: 'variant.sell', entity: 'variant', entityId, meta: { quantity } });
```
`shopId` و `userId` و `requestId` از context درخواست به‌طور خودکار پر می‌شوند.

## مهاجرت

```bash
npx prisma migrate deploy     # 20261107000000_audit_log
```
