import type { NextConfig } from 'next';

const apiUrl = (
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000'
).replace(/\/$/, '');

/**
 * Basic CSP. Includes 'unsafe-eval' + ws/http so Next.js dev / Playwright and
 * same-origin API calls work; still blocks framing and foreign form posts.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: http: ws: wss:",
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
        source: '/openapi.json',
        destination: `${apiUrl}/openapi.json`,
      },
      {
        source: '/llms.txt',
        destination: `${apiUrl}/llms.txt`,
      },
    ];
  },
};

export default nextConfig;
