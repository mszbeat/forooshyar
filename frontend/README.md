# Frontend — پنل فروشنده فروش‌یار

Next.js App Router (React 19, TypeScript) seller panel. Persian, RTL, mobile-first.
This application installs and runs from this directory independently from the backend.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Start the backend separately (`../backend`).

## Routes

| Route | Purpose |
|---|---|
| `/` | صفحه فرود (معرفی محصول، امکانات، اصول) |
| `/login` | ورود و ساخت فروشگاه (`?mode=register`) |
| `/app` | داشبورد: فروش امروز/هفته، ارزش انبار، کارهای باقی‌مانده، آخرین گردش موجودی |
| `/app/products` | جستجو، محصول/واریانت، دکمه «فروخته شد»، تغییر موجودی، دفتر گردش هر واریانت |
| `/app/import` | بارگذاری CSV/XLSX با گزارش خطای ردیفی و دانلود فایل نمونه |
| `/app/assistant` | گفتگوی آزمایشی پاسخ‌گویی + توضیح منطق تصمیم |
| `/app/settings` | نام، لحن، ارسال، پرداخت، ساعت کاری و پیام ارجاع |

## How the API is reached

The browser only calls the same origin. `next.config.mjs` rewrites `/api/*` to
`API_PROXY_TARGET` (default `http://127.0.0.1:3001`), so no API host is baked
into the client bundle and the panel works behind any reverse proxy or preview
domain. Set `NEXT_PUBLIC_API_BASE_URL` only when the API lives on a different
public origin; in that case the backend must allow the panel's exact origin in
`CORS_ORIGINS`.

`NEXT_PUBLIC_*` values are public — never put a secret there.

## Design system (v4 «Aurora»)

- `app/globals.css` — tokens (surfaces, ink, brand, radius, elevation, type,
  spacing), reset, components (card, button, field, badge, table, modal, toast,
  chart, chat, dropzone), seller + admin shells, conversations, customers,
  utilities and responsive rules. Dark-first premium (Linear-inspired),
  Persian RTL, content width 1240px.
- `app/landing.css` — landing page (gradient-mesh hero, glass phone, bento,
  compare, flow, rules, FAQ, CTA, footer).
- `app/auth.css` — login/register split screen with gradient visual panel.
- `app/fonts.css` + `public/fonts/*.woff2` — Vazirmatn (text) + Estedad
  (display), self-hosted (no CDN, so the panel renders correctly offline
  and in sandboxed previews).
- `components/icons.tsx` — inline SVG icon set (no icon dependency).
- `components/ui.tsx` — `Modal`, `Field`, `StatCard`, `EmptyState`, `Skeleton`,
  `Spinner`, `Segmented`, `Switch`, `PageHeader`, toast provider.
- `lib/format.ts` — Persian digits, Toman formatting, Jalali dates, relative
  time (no date library).
- `lib/api.ts` — typed client for every API endpoint, error normalization and
  token storage.
- `lib/auth.tsx` — session provider; the token is persisted in `localStorage`,
  so reloading the page no longer signs the user out.

## Build

```sh
npm run build
npm run start
```

Next.js defaults to port 3000 and honors `PORT`. HTTPS is required in
production, normally through a reverse proxy.

## Still missing

Conversations, customers, channel connection (Telegram/Bale/Instagram), the
LLM polish layer, handoff inbox and billing are not implemented yet — the API
does not expose them either. The sidebar marks them as «به‌زودی».
