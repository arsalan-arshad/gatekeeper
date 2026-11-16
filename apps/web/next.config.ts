import type { NextConfig } from 'next';

const apiUrl = (
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000'
).replace(/\/$/, '');

const posthogIngestOrigin = (
  process.env.POSTHOG_PROXY_INGEST_ORIGIN ?? 'https://us.i.posthog.com'
).replace(/\/$/, '');

const posthogAssetOrigin = (
  process.env.POSTHOG_PROXY_ASSET_ORIGIN ?? 'https://us-assets.i.posthog.com'
).replace(/\/$/, '');

/**
 * Basic CSP. Includes 'unsafe-eval' + ws/http so Next.js dev / Playwright and
 * same-origin API calls work; still blocks framing and foreign form posts.
 * PostHog is loaded only via same-origin `/ingest` proxy (no new wildcards).
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: http: ws: wss:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
];

const noindexHeaders = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];

const staticAssetCache = [
  { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@gatekeeper/db'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/api/auth/:path*',
        headers: noindexHeaders,
      },
      {
        source: '/start/check-email',
        headers: noindexHeaders,
      },
      {
        source: '/og.png',
        headers: staticAssetCache,
      },
      {
        source: '/favicon.ico',
        headers: staticAssetCache,
      },
      {
        source: '/favicon-16.png',
        headers: staticAssetCache,
      },
      {
        source: '/favicon-32.png',
        headers: staticAssetCache,
      },
      {
        source: '/apple-touch-icon.png',
        headers: staticAssetCache,
      },
      {
        source: '/icon-512.png',
        headers: staticAssetCache,
      },
      {
        source: '/icon.svg',
        headers: staticAssetCache,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/demo',
        destination: '/@demo',
        permanent: true,
      },
      {
        source: '/u/:handle/ledger',
        destination: '/@:handle/ledger',
        permanent: true,
      },
      {
        source: '/u/:handle',
        destination: '/@:handle',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/@:handle/ledger',
        destination: '/u/:handle/ledger',
      },
      {
        source: '/@:handle',
        destination: '/u/:handle',
      },
      {
        source: '/manifest.json',
        destination: '/manifest.webmanifest',
      },
      {
        source: '/openapi.json',
        destination: `${apiUrl}/openapi.json`,
      },
      {
        source: '/llms.txt',
        destination: `${apiUrl}/llms.txt`,
      },
      {
        source: '/ingest/static/:path*',
        destination: `${posthogAssetOrigin}/static/:path*`,
      },
      {
        source: '/ingest/:path*',
        destination: `${posthogIngestOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
