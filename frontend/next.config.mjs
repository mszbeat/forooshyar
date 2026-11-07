/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // `/api/*` is proxied to the NestJS API by app/api/[...path]/route.ts, which
  // reads API_PROXY_TARGET at request time (no rebuild needed to change it).
  // An absolute NEXT_PUBLIC_API_BASE_URL is only needed when the panel and the
  // API are served from different origins.
};

export default nextConfig;
