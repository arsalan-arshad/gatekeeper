import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Keep the workspace DB package outside the Next webpack graph. Bundling it
  // pulls in migrate.js → ../drizzle, which webpack cannot resolve.
  serverExternalPackages: ['@gatekeeper/db'],
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
    ];
  },
};

export default nextConfig;
