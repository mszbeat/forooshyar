import type { NextRequest } from 'next/server';

/**
 * Runtime API proxy: the browser only ever calls this same origin (`/api/*`),
 * and this handler forwards to the NestJS API.
 *
 * Why a route handler instead of `rewrites()` in next.config.mjs: rewrites are
 * frozen into the build (`.next/routes-manifest.json`), so the API address could
 * only be changed by rebuilding. Here `API_PROXY_TARGET` is read per request,
 * which means a different port/host is a restart, not a rebuild.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// خواندن در زمان اجرا (نه در سطح ماژول): روی Render با تغییر env و ری‌استارت
// بدون rebuild اعمال می‌شود، و اگر متغیر غلط باشد پیام واضح می‌دهیم نه ۵۰۰ خاموش.
const FALLBACK_TARGET = 'http://127.0.0.1:3001';

function resolveTarget(): { url: string | null; error?: string } {
  const raw = (process.env.API_PROXY_TARGET || '').trim();
  if (!raw) {
    // سازگاری با نامی که خود Render تزریق می‌کند، برای اینکه یک متغیر جا نیفتد.
    const injected = (process.env.API_INTERNAL_URL || '').trim();
    if (injected) return { url: injected.replace(/\/+$/, '') };
    return { url: FALLBACK_TARGET };
  }
  if (!/^https?:\/\//i.test(raw)) {
    return { url: null, error: `API_PROXY_TARGET باید با http:// یا https:// شروع شود (مقدار فعلی: ${raw})` };
  }
  return { url: raw.replace(/\/+$/, '') };
}

/** Hop-by-hop headers that must not be forwarded in either direction (RFC 9110 §7.6.1). */
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'content-length',
]);

function forwardable(headers: Headers): Headers {
  const output = new Headers();
  headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) output.set(key, value);
  });
  return output;
}

async function proxy(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path } = await context.params;

  const resolved = resolveTarget();
  if (!resolved.url) {
    console.error(`[api-proxy] ${resolved.error}`);
    return Response.json({ statusCode: 500, message: 'تنظیمات سرور ناقص است (API_PROXY_TARGET).' }, { status: 500 });
  }

  // فیلتر کردن مسیرهای خالی: اگر پنل `/api/auth/login` یا اشتباهاً `/api//auth/login`
  // صدا بزند، اینجا به یک مسیر تمیز تبدیل می‌شود و به API دوبل‌اسلش نمی‌رسد.
  const segments = (path ?? []).filter(segment => segment.length > 0);
  const target = new URL(`${resolved.url}/${segments.join('/')}`);
  target.search = request.nextUrl.search;

  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers: forwardable(request.headers),
    redirect: 'manual',
    cache: 'no-store',
  };

  // Render free سرویس‌ها بعد از ۱۵ دقیقه بی‌کاری خواب می‌روند و بیدار شدنشان تا
  // حدود یک دقیقه طول می‌کشد. بدون تایم‌اوت، کاربر پنل تا ابد منتظر می‌ماند.
  const timeoutMs = Number(process.env.API_PROXY_TIMEOUT_MS ?? 45000);
  init.signal = AbortSignal.timeout(timeoutMs);

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    // Stream the body straight through: uploads (CSV/XLSX) never hit memory twice.
    init.body = request.body;
    init.duplex = 'half';
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (error) {
    // The panel keeps working and shows its own error state; the API being down
    // must not look like a 500 in the server log without a clear message.
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    console.error(`[api-proxy] ${request.method} ${target.pathname} → ${timedOut ? 'timeout' : 'unreachable'} (${target.origin})`);
    return Response.json(
      {
        statusCode: 503,
        message: timedOut
          ? 'سرور در حال بیدار شدن است و پاسخ نداد؛ یک دقیقه بعد دوباره تلاش کنید.'
          : 'ارتباط با سرور برقرار نشد. لطفاً چند لحظه بعد دوباره تلاش کنید.',
        upstream: target.origin,
      },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }

  const headers = forwardable(upstream.headers);
  // The API already decides caching for its own payloads; never let a CDN keep
  // authenticated shop data.
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store');

  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
