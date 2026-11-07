# Backend

NestJS API and Prisma/PostgreSQL database layer. Node.js 20+, npm and an existing PostgreSQL database/user are required. Redis is optional for caching; no Docker required. The requested TypeORM migration has **not** been completed. The server uses Prisma and migration-based schema management; it does not run TypeORM `synchronize`.

## Logging / audit trail

Every request is logged (method, path, status, duration, ip, request id) and every
domain action (sale, stock change, import, settings change, login) writes a
structured event with its own metadata. Mutations and failures are stored in the
`AuditLog` table; successful reads go to stdout only unless `AUDIT_LOG_READS=true`.
Read the trail with `GET /audit` and `GET /audit/actions`; prune it with
`npm run audit:prune`. Full details: [`docs/LOGGING.md`](docs/LOGGING.md).

## Development

From this directory:

```sh
npm ci
cp .env.example .env
```

Edit `.env`: set `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`, and a random `JWT_SECRET` of at least 32 characters. The app loads this file automatically. If you used the old root `.env`, it is not automatically moved: copy its real database credentials into this file. Never commit or share secrets. PostgreSQL and the database/user must already exist.

```sh
npm run prisma:deploy
npm run dev
```

The API listens on port 3001 by default; `GET http://localhost:3001/health` is liveness only and does not test the database. `prisma:deploy` applies committed migrations; **back up existing data before migrations**. Previously applied Prisma migrations remain recorded and are not reapplied. Legacy `DATABASE_URL` is supported only if no separate `DB_*` fields are set. If any `DB_*` connection fields are set they take precedence; fill all required fields. `DB_SSL_MODE=disable` is for local use; production should use TLS and verify the server identity with `verify-full` and properly configured trusted certificates. Avoid disabling certificate verification.

## Standalone server

```sh
npm ci
npm run build
npm run prisma:deploy
npm run start
```

Configure real environment variables or `.env` on the backend host, including `CORS_ORIGINS=https://your-frontend.example` (exact origin, no path/trailing slash; comma-separate multiple origins) and `PORT`. Use HTTPS reverse proxy, private database networking, backups, process supervision, and strong credentials. This setup has not been hardened or validated for production. The current migration runner uses development dependencies, so do not omit them during migration. `CACHE_ENABLED=false` requires no Redis for the current application.

## Tests

```sh
npm test
npm run build
```

The integration suite must use a separate disposable database. Apply migrations to that test database using its `DB_*` values in a clean environment, build, then set `TEST_DATABASE_URL` and run `npm run test:integration`. It creates and removes its own test data; **never point it at production**. With no `TEST_DATABASE_URL` it skips. Tests cover selected tenant boundaries, concurrent and idempotent stock sales, CSV/XLSX imports and preview behavior.

## API notes

`POST /auth/register` takes `{ "email", "password", "shopName" }` and returns a Bearer token. Products, variants, shop settings, stock, import and `/bot/preview` require the token. Prices are integer toman; inventory updates and their ledger entries are transactional. `Idempotency-Key` on `POST /variants/:id/sell` protects retries of the same sale. Manual adjustments and imports are not idempotent. Product/variant DELETE archives rather than physically deleting history. Import accepts multipart `file` with CSV/XLSX, English or Persian headers, maximum 2 MiB and 1,000 data rows. Each successful row creates a new product. See `../examples/catalog.csv` in the repository. Fresh preview does not send messages or notify a seller.
