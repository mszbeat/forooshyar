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

const TARGET = (process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001').replace(/\/+$/, '');

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
  const target = new URL(`${TARGET}/${(path ?? []).join('/')}`);
  target.search = request.nextUrl.search;

  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers: forwardable(request.headers),
    redirect: 'manual',
    cache: 'no-store',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    // Stream the body straight through: uploads (CSV/XLSX) never hit memory twice.
    init.body = request.body;
    init.duplex = 'half';
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    // The panel keeps working and shows its own error state; the API being down
    // must not look like a 500 in the server log without a clear message.
    return Response.json(
      { statusCode: 503, message: 'ارتباط با سرور برقرار نشد. لطفاً چند لحظه بعد دوباره تلاش کنید.', upstream: target.origin },
      { status: 503 },
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
