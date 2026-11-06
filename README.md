# Forooshyar (فروش‌یار)

A Persian-first sales assistant in development. The repository contains two **separately installable and deployable** Node.js applications:

```text
backend/        NestJS API, PostgreSQL migrations, tests and .env.example
frontend/       Next.js seller panel and .env.example
examples/       Example catalog CSV
PROJECT_PLAN.md Phased roadmap and task IDs
ARCHITECTURE.md Target design and known limitations
```

Both directories have their own `package.json`, lockfile and environment file. See [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md) for independent instructions. No Docker is used. Deploy the backend and frontend on separate services, set backend `CORS_ORIGINS` to the exact frontend origin, and set frontend `NEXT_PUBLIC_API_BASE_URL` to the public API URL **when building the frontend**. Use HTTPS for both.

## Current implementation and important limitations

This is **not a completed or production-ready product**. Current features: owner registration/login, basic catalog, variant and stock ledger operations, CSV/XLSX import, a limited deterministic Persian reply preview and an early seller panel. Optional Redis cache exists but is not used by the catalog. Real Telegram delivery, queue workers, OpenRouter, seller notifications, conversations, post recognition, full security hardening and production deployment remain unfinished. The Fresh preview is not a bot and must not be used as one. See the roadmap for status.

The backend currently uses **Prisma**, not the requested TypeORM configuration. `ConfigModule` and separate `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME` variables were added, but migrating all existing database access and migrations to TypeORM remains undone. Do not interpret this change as a TypeORM migration. Existing Prisma migrations remain the source of schema changes, and automatic schema synchronization is not enabled. Before database changes back up your data.

Price and stock are read from PostgreSQL, stock movements are transactional, and every protected query is intended to be shop-scoped. Tests cover selected isolation and concurrency scenarios, not an exhaustive security proof. Never commit secrets.
