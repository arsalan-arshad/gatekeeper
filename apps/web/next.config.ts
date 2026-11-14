import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@gatekeeper/db'],
  async rewrites() {
    return [
      {
        source: '/@:handle',
        destination: '/u/:handle',
      },
    ];
  },
};

export default nextConfig;
