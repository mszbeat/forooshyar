# Forooshyar (فروش‌یار)

دستیار فروش فارسی‌محور برای فروشگاه‌های آنلاین؛ هدف آن پاسخ به مشتریان از کاتالوگ زنده و ارجاع موارد نامطمئن به فروشنده است. تلگرام اولین کانال برنامه‌ریزی‌شده است؛ بله و اینستاگرام رسمی در فازهای بعدی قرار دارند.

## Current status

**Phase 1 is in progress, not production-ready.** Implemented: NestJS API, email/password registration and login with one-hour JWT, one owner/shop, shop settings, product/variant creation and editing, guarded stock decrement and adjustment, and stock movement ledger in PostgreSQL. A real PostgreSQL integration test covers concurrent sales and selected cross-tenant access attempts. Cache is optional and is not used for catalog data.

Missing: full CRUD (including variant deletion), CSV/Excel import, comprehensive tenant-isolation coverage, the remaining domain models, structured logging, production deployment/security hardening, Telegram, workers, OpenRouter, seller panel and post recognition. The web app remains a Persian RTL landing placeholder. Do not deploy this scaffold to production. See [PROJECT_PLAN.md](PROJECT_PLAN.md) for task IDs and [ARCHITECTURE.md](ARCHITECTURE.md) for the target design.

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
apps/api/src/shop/       Owner shop settings
apps/api/src/cache/      Optional tenant-scoped Redis cache
apps/api/prisma/         PostgreSQL schema and migrations
apps/api/test/           Unit tests and PostgreSQL integration test
apps/web/                Next.js App Router scaffold
packages/shared/         Shared TypeScript types
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

The app does not automatically read `.env`; export it into the shell as shown (use shell-safe values). `npm ci` generates Prisma Client via the API workspace's postinstall script. `prisma:deploy` applies committed migrations to the configured database; back up important data before applying migrations. The example connection string must be replaced with your PostgreSQL credentials; URL-encode special characters in the password. In another terminal run `npm run dev:web`. Web: `http://localhost:3000`. API health: `GET http://localhost:3001/health` (liveness only; does not check PostgreSQL or Redis).

`CACHE_ENABLED=false` disables caching and does not require Redis. To enable the optional cache, run Redis separately and set `CACHE_ENABLED=true` and `REDIS_URL=redis://localhost:6379` (or `rediss://` for TLS). Cache failures become misses; no feature currently uses the cache. Prices, stock and authorization decisions must always come from PostgreSQL. Future BullMQ workers may require Redis independently of this flag.

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

The integration test creates and deletes its own shops and data; never point it at production. If `TEST_DATABASE_URL` is absent, the integration test is skipped. The test exercises selected tenant boundaries, not an exhaustive security proof.

## Glossary

- **Shop / tenant:** an independently authorized seller workspace.
- **Variant:** a sellable size/color with its own price and stock.
- **Stock movement:** audit entry recording a stock change.
- **Fresh / Polish:** planned deterministic response / optional guarded LLM adaptation.
- **Handoff:** route a conversation to its seller instead of guessing.
