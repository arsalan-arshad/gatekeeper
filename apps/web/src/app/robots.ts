import type { MetadataRoute } from 'next';

import { BRAND } from '@/lib/brand';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard',
          '/dashboard/',
          '/e2e',
          '/e2e/',
          '/api/',
          '/start/check-email',
          '/u/',
        ],
      },
    ],
    sitemap: `${BRAND.siteUrl}/sitemap.xml`,
  };
}
