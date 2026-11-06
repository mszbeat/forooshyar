# Forooshyar (فروش‌یار)

دستیار فروش فارسی‌محور برای فروشگاه‌های آنلاین؛ هدف آن پاسخ به مشتریان از کاتالوگ زنده و ارجاع موارد نامطمئن به فروشنده است. تلگرام اولین کانال برنامه‌ریزی‌شده است؛ بله و اینستاگرام رسمی در فازهای بعدی قرار دارند.

## Current status

**Phase 1 is in progress, not production-ready.** Implemented: NestJS API, email/password registration and login with one-hour JWT, one owner/shop, shop settings, product/variant creation and editing, guarded stock decrement and adjustment, stock movement ledger in PostgreSQL, and CSV/XLSX catalog import with row-level results. A real PostgreSQL integration test covers concurrent sales and selected cross-tenant access attempts. Cache is optional and is not used for catalog data. A deterministic Persian Fresh preview reads live tenant-scoped catalog data; it is not connected to any messaging channel.

Missing: full CRUD (including variant deletion), comprehensive tenant-isolation coverage, the remaining domain models, structured logging, production deployment/security hardening, Telegram, workers, OpenRouter, seller panel and post recognition. The Persian RTL web app supports registration/login, shop settings, product creation, variant creation, single-unit sales import and a Fresh preview; it is an early panel, not the complete seller panel. Authentication is stored in memory only, so reloading logs the user out. Do not deploy this scaffold to production. See [PROJECT_PLAN.md](PROJECT_PLAN.md) for task IDs and [ARCHITECTURE.md](ARCHITECTURE.md) for the target design.

## Principles

- Prices and stock come only from PostgreSQL. Never invent catalog facts.
- Fresh: deterministic Persian normalization, retrieval and templates first. Polish: a swappable LLM client only when appropriate, with strict validation and safe fallback.
- Sensitive or uncertain requests are handed to a human; customer text is data, not instructions.
- Every tenant-owned record and query is isolated by shop; stock changes and ledger entries are transactional.
- Secrets stay outside Git; channel credentials must be encrypted at rest. All seller/customer interfaces are Persian and RTL.

## Repository layout

```text
apps/api/src/auth/       Registration, login and JWT guard
apps/api/src/catalog/    Products, variants and stock ledger
apps/api/src/imports/    CSV/XLSX catalog imports
apps/api/src/fresh/      Deterministic Persian reply preview
apps/api/src/shop/       Owner shop settings
apps/api/src/cache/      Optional tenant-scoped Redis cache
apps/api/prisma/         PostgreSQL schema and migrations
apps/api/test/           Unit tests and PostgreSQL integration test
apps/web/                Next.js App Router early seller panel
packages/shared/         Shared TypeScript types
examples/catalog.csv     Sample import file
ARCHITECTURE.md          Target architecture and data model
PROJECT_PLAN.md          Phased roadmap and task IDs
.env.example             Example settings; no real secrets
```

## Local development (without Docker)

Requires Node.js 20+, npm, and a separately installed PostgreSQL server. Create a database and user using your local PostgreSQL installation, then from the repository root:

```sh
npm ci
cp .env.example .env
# Edit DATABASE_URL and JWT_SECRET in .env. Use a long random secret.
set -a
source .env
set +a
npm run prisma:deploy -w @forooshyar/api
npm run dev:api
```

The app does not automatically read `.env`; export it into the shell as shown (use shell-safe values). `npm ci` generates Prisma Client via the API workspace's postinstall script. `prisma:deploy` applies committed migrations to the configured database; back up important data before applying migrations. The example connection string must be replaced with your PostgreSQL credentials; URL-encode special characters in the password. In another terminal, export the same `.env` values and run `npm run dev:web`. The frontend reads `NEXT_PUBLIC_API_BASE_URL`, and the API accepts browser requests only from configured `CORS_ORIGINS`. Web: `http://localhost:3000`. API health: `GET http://localhost:3001/health` (liveness only; does not check PostgreSQL or Redis).

`CACHE_ENABLED=false` disables caching and does not require Redis. To enable the optional cache, run Redis separately and set `CACHE_ENABLED=true` and `REDIS_URL=redis://localhost:6379` (or `rediss://` for TLS). Cache failures become misses; no feature currently uses the cache. Prices, stock and authorization decisions must always come from PostgreSQL. Future BullMQ workers may require Redis independently of this flag.

## Separate frontend and backend deployment (target setup)

The applications remain in one repository but run on **two independently deployed services**. No Docker is required. These are setup guidelines for testing; production hardening, full features and an end-to-end production deployment are not yet complete.

**Backend service** (Node.js 20, private PostgreSQL, optional Redis): install from the repository root with `npm ci`, then run `npm run build -w @forooshyar/api`. Set `DATABASE_URL`, a strong unique `JWT_SECRET`, `PORT` and `CORS_ORIGINS` on that service. Set `CORS_ORIGINS` to the exact HTTPS origin of the frontend, e.g. `https://panel.example.com` (no trailing slash or path); comma-separate multiple exact origins. Apply `npm run prisma:deploy -w @forooshyar/api`, then start `npm run start -w @forooshyar/api`. Keep PostgreSQL/Redis private; use a TLS reverse proxy for the API. Current rate limits are in-memory per process.

**Frontend service**: install with `npm ci` at the repository root, set `NEXT_PUBLIC_API_BASE_URL=https://api.example.com` **at build time**, build with `npm run build -w @forooshyar/web`, then run `npm run start -w @forooshyar/web`. Next.js embeds the public API URL in browser JavaScript, so rebuild after changing it. Never put secrets in `NEXT_PUBLIC_*` variables. Use HTTPS for both services to avoid browser mixed-content restrictions. Configure the API origin before building the web service.

CORS is a browser policy, not authentication. API JWT validation and tenant checks remain required for every protected route. The current authentication token is stored only in React memory and is lost on refresh; robust session handling is not yet implemented. Neither service is production-ready.

## API quick start

All routes other than `/health` and `/auth/*` require `Authorization: Bearer <accessToken>`. Registration creates one shop; email is case-normalized, password must be 10–128 characters. No refresh or password recovery exists yet. Never use the sample credentials below in production.

```sh
curl -X POST http://localhost:3001/auth/register -H 'Content-Type: application/json' \
  -d '{"email":"seller@example.com","password":"example-password-123","shopName":"فروشگاه نمونه"}'
# Copy accessToken from the response:
export TOKEN='paste-access-token-here'
curl -X POST http://localhost:3001/products -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"مانتو آبی"}'
# Copy id from the response:
export PRODUCT_ID='paste-product-id-here'
curl -X POST "http://localhost:3001/products/$PRODUCT_ID/variants" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"price":1250000,"stock":5,"size":"۴۰"}'
# Copy id from the response:
export VARIANT_ID='paste-variant-id-here'
curl -X POST "http://localhost:3001/variants/$VARIANT_ID/sell" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"quantity":1}'
curl "http://localhost:3001/variants/$VARIANT_ID/movements" -H "Authorization: Bearer $TOKEN"
```

Prices are integer **toman**, limited to PostgreSQL signed 32-bit integers; stock is nonnegative integer. `POST /variants/:id/stock` takes `{ "delta": 3, "reason": "restock" }` (reason `restock` or `manual`). `PATCH /variants/:id` changes price/size/color/SKU, not stock. Products can be deactivated with `PATCH /products/:id` and `{ "active": false }`. `GET /products` and movements currently return at most 100 entries, without pagination. Stock operations are not idempotent: retrying a successful sale can decrement twice; client-side retries must be avoided until idempotency is implemented. API rate limits are in-memory per process and are not suitable for distributed deployments.

## Fresh reply preview

`POST /bot/preview` accepts an authenticated body such as `{ "message": "قیمت مانتو آبی چنده؟" }` and returns `kind` (`answer`, `clarify`, or `handoff`) and Persian `text`. The same preview is available in the web panel. It uses only the current shop’s active products and live database prices and stock, normalizes Persian and Arabic characters and digits, and uses conservative rules and templates. Product matching requires the complete normalized title; ambiguous products or variants prompt clarification. The preview falls back to handoff for large catalogs over 500 products or uncertain/sensitive requests. It is only a preview: **no messages are sent, no conversations or handoffs are persisted, and no seller is notified**. Matching and classification are deliberately limited, with no fuzzy search, contextual memory or clarification buttons yet; do not use it as a production bot.

The unit evaluation includes 50 synthetic Persian questions for price, stock and handoff. This is not a representative real-world or LLM evaluation, and it does not establish production accuracy or complete prompt-injection protection.

## Catalog import (CSV/XLSX)

Upload one CSV (UTF-8) or `.xlsx` file as multipart form field `file`:

```sh
curl -X POST http://localhost:3001/catalog/import \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@examples/catalog.csv"
```

The first row must contain `title` (or `name` / `نام محصول` / `نام`), `price` (`قیمت`) and `stock` (`موجودی`). Optional headers: `size` (`سایز`), `color` (`رنگ`), `sku`. `price` is integer toman; price and stock accept Persian, Arabic or Latin digits and digit grouping separators. SKU must be unique per shop; for leading zeros format its Excel cells as text. The first worksheet is used. Formula and other non-plain cell values in recognized columns are rejected; formulas are not evaluated.

Each non-empty row creates a **new product with one variant**, not an update to an existing product. Each row commits separately, including its initial stock movement. Response `results` lists `row`, `status`, IDs for success or errors for failure; other valid rows still import. CSV line numbers correspond to the last physical line of a record. The file has limits of 2 MiB compressed/uploaded, 10 MiB expanded for XLSX, 1,000 data rows and 20 columns. Only the first sheet is processed. Re-importing creates duplicates (or SKU conflicts), so do not retry an uncertain or partially completed import blindly. A server/database failure can interrupt the request after earlier rows committed; resumable/idempotent imports are not implemented.

## Tests

```sh
npm test
npm run build
```

For the integration test, use a **separate disposable PostgreSQL database**, owned by a test user. Apply migrations to that database first, then run:

```sh
export TEST_DATABASE_URL='postgresql://testuser:testpassword@localhost:5432/forooshyar_test?schema=public'
DATABASE_URL="$TEST_DATABASE_URL" npm run prisma:deploy -w @forooshyar/api
npm run build -w @forooshyar/api
npm run test:integration -w @forooshyar/api
```

The integration test creates and deletes its own shops and data; never point it at production. If `TEST_DATABASE_URL` is absent, the integration test is skipped. The test exercises selected tenant boundaries, Fresh preview isolation, concurrent stock changes, and CSV/XLSX imports, not an exhaustive security proof.

## Glossary

- **Shop / tenant:** an independently authorized seller workspace.
- **Variant:** a sellable size/color with its own price and stock.
- **Stock movement:** audit entry recording a stock change.
- **Fresh / Polish:** planned deterministic response / optional guarded LLM adaptation.
- **Handoff:** route a conversation to its seller instead of guessing.
