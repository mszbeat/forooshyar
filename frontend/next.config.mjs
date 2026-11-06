/** @type {import('next').NextConfig} */
const apiTarget = process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001';

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // The browser always calls the same origin (`/api/*`). Next.js proxies those
  // requests to the API, so the panel works behind any reverse proxy or tunnel
  // without hard-coding an API host into the client bundle.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiTarget}/:path*` }];
  },
};

export default nextConfig;
