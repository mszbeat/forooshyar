# Forooshyar (فروش‌یار)

دستیار فروش فارسی‌محور برای فروشگاه‌های آنلاین؛ هدف آن پاسخ به مشتریان از کاتالوگ زنده و ارجاع موارد نامطمئن به فروشنده است. تلگرام اولین کانال برنامه‌ریزی‌شده است؛ بله و اینستاگرام رسمی در فازهای بعدی قرار دارند.

## Current status

This repository is at the **initial scaffolding** stage, not a working sales assistant. The NestJS API has a health endpoint, basic environment validation, and an optional Redis cache service, not yet used by any feature. The Next.js app has a Persian RTL landing placeholder. Authentication, catalog, stock, import, workers, Telegram, OpenRouter, seller panel, database models/migrations and tenant isolation are **not implemented**. Do not deploy this scaffold to production. See [PROJECT_PLAN.md](PROJECT_PLAN.md) for the task IDs and [ARCHITECTURE.md](ARCHITECTURE.md) for the proposed design.

## Principles

- Prices and stock come only from PostgreSQL. Never invent catalog facts.
- Fresh: deterministic Persian normalization, retrieval and templates first. Polish: a swappable LLM client only when appropriate, with strict validation and safe fallback.
- Sensitive or uncertain requests are handed to a human; customer text is data, not instructions.
- Every tenant-owned record and query is isolated by shop; stock changes and ledger entries are transactional.
- Secrets stay outside Git; channel credentials must be encrypted at rest. All seller/customer interfaces are Persian and RTL.

## Repository layout

```text
apps/api/        NestJS API scaffold, Prisma datasource and tests
apps/web/        Next.js App Router scaffold
packages/shared/ Shared TypeScript types
ARCHITECTURE.md  Target modules, data model and deployment decisions
PROJECT_PLAN.md  Phased roadmap and task IDs
.env.example     Example configuration; no real secrets
```

## Development

Requires Node.js 20+, npm and a locally installed or separately managed PostgreSQL server. Redis is optional for caching. No Docker is used. From the repository root:

```sh
npm ci
cp .env.example .env
# Edit .env and replace secrets with strong random values.
```

For local API execution, export the values in `.env` into your shell (the app does not automatically load the file), then run `npm run dev:api`. Run `npm run dev:web` separately. API health: `GET http://localhost:3001/health`. Web: `http://localhost:3000`.

Create a PostgreSQL database and user separately, then set `DATABASE_URL`. No database migrations exist yet. To export the example file for local development (use shell-safe values), run:

```sh
set -a
. ./.env
set +a
npm run dev:api
```

`CACHE_ENABLED=false` (the default) disables caching and does not require Redis. To enable the optional cache, run Redis separately and set `CACHE_ENABLED=true` and `REDIS_URL=redis://localhost:6379` (or `rediss://` for TLS). The cache service uses tenant-scoped keys and TTLs and treats Redis failures as cache misses. No application feature currently uses it. Prices, stock and authorization decisions must always come from PostgreSQL, not this cache. Later BullMQ workers may require Redis independently of the cache flag; queues are not implemented yet.

```sh
npm test
npm run build
```

Tests currently cover configuration and the cache service with a fake Redis client; no database, concurrency, isolation or bot tests exist yet. Neither the health endpoint nor the scaffold verifies database/Redis connectivity.

## Glossary

- **Shop / tenant:** an independently authorized seller workspace.
- **Variant:** a sellable size/color with its own price and stock.
- **Stock movement:** immutable audit entry recording a stock change.
- **Fresh / Polish:** deterministic first response / optional guarded LLM adaptation.
- **Handoff:** route a conversation to its seller instead of guessing.
