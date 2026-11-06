# Architecture and target design

The target is a TypeScript npm-workspaces monorepo: `apps/api` (NestJS REST API and worker entry point), `apps/web` (Next.js App Router, Persian RTL), `packages/shared` (transport types and validation primitives). PostgreSQL is the source of truth, accessed through Prisma; Redis is optional for caching, controlled by `CACHE_ENABLED`; Redis and BullMQ are planned for asynchronous delivery separately from caching. Services run without Docker. The current implementation has owner-only shops, JWT authentication, product/variant endpoints, transactional stock movements and bounded row-by-row CSV/XLSX imports; no channel or LLM integration exists yet.

## Intended API modules

- `config`, `auth`, `users`, `shops`: validated configuration, password hashing, JWT authentication and server-side membership authorization.
- `catalog`, `variants`, `stock`, `imports`: tenant-scoped product/variant CRUD, transactional ledger and CSV/XLSX imports with per-row errors.
- `customers`, `conversations`, `messages`, `handoff`: customer history, seller notifications, manual reply and bot mute.
- `channels/telegram`, `channels/bale`, `channels/instagram`: adapters implementing shared incoming/outgoing contracts; authenticated webhooks enqueue quickly and workers handle retries/idempotency.
- `fresh`: Persian normalization, deterministic intent, scoped catalog retrieval and templates. `polish`: provider-neutral LLM client, OpenRouter, budgets and guardrails; never send arbitrary catalog data across tenants.
- `posts`, `usage`, `subscriptions`: post links and drafts, metering and plan settings.

## Data design

Use UUID IDs, timestamps and explicit `shopId` on every tenant-owned table. Composite unique keys and foreign keys including `shopId` prevent cross-tenant relations; all services derive tenant from authenticated membership, never a client-provided tenant alone. The current implementation creates one shop per owner and has no membership table; multi-user memberships are a future design. Enforce membership and tenant predicates on every read and write, with integration tests against real PostgreSQL. Global user identity is not tenant-owned.

- `users`: unique normalized email, password hash; `shops`: name, tone, shipping/payment/hours/handoff settings; `shop_memberships`: user, shop, role.
- `channel_connections`: platform, encrypted token, encryption version, status, platform identifier; use authenticated encryption with a separate environment-provided key. Never log tokens.
- `products`: shop, title, description, category, active; `variants`: shop, product, SKU, size, color, integer price in toman, nonnegative integer stock and `stockUpdatedAt`.
- `stock_movements`: shop, variant, signed delta, reason, actor and timestamp. Every stock change and corresponding movement are one transaction; guarded decrement includes shop ID and `stock >= quantity`. Concurrent tests must use actual PostgreSQL and independent transactions.
- `customers`, `conversations`, `messages`: tenant-scoped platform identity, handoff/mute state, direction and body.
- `posts`, `post_product_links`: tenant-scoped platform identifiers and product associations; unique channel/post identity.
- `usage_logs`, `subscriptions`: shop, usage/tokens/cost, plan, limits and model configuration; reserve daily budget atomically before external calls to avoid parallel overspend.

Only users, shops, products, variants and stock movements are currently implemented in Prisma; the remaining models and memberships are design targets. Add migrations and appropriate indexes/check constraints as each phase is implemented. Never trust an LLM for price or availability: use deterministic replies where possible; number validation alone cannot prevent semantic or stock errors, so Polish must also be constrained by deterministic facts and fall back safely. Treat customer text as untrusted data. Avoid logging personal messages or credentials.

## Configuration and deployment

See `.env.example`: PostgreSQL, optional Redis cache, JWT, channel encryption key and OpenRouter settings are environment-driven. `CACHE_ENABLED=false` requires no cache connection; a future BullMQ queue may still require Redis even with caching disabled. Cache keys must include shop ID and a bounded TTL; do not cache price, stock or authorization. Later add per-plan model/budget policy, timeout/retry configuration, webhook secrets and base URL `https://openrouter.ai/api/v1`. Never store a real secret in Git. Install and supervise services directly on a VPS, with HTTPS reverse proxy, secret management, migrations, backups, non-root execution, resource limits and health checks before deployment.

## Phasing

Implement and test P1 before Telegram/Fresh (P2), Polish/handoff/eval (P3), seller panel (P4), then post matching (P5). Instagram requires fresh verification against official Meta documentation, app review and availability from Iran before implementation; no unofficial automation. `PROJECT_PLAN.md` retains original task IDs and acceptance criteria.
