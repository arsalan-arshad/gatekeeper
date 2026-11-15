import type { NextConfig } from 'next';

const apiUrl = (
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4000'
).replace(/\/$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@gatekeeper/db'],
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
