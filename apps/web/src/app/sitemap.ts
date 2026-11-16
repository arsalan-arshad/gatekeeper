import type { MetadataRoute } from 'next';

import { BRAND } from '@/lib/brand';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = BRAND.siteUrl;
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/start`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/ledger`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${base}/@demo`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/@demo/ledger`, lastModified: now, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
