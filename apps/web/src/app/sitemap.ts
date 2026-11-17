import type { MetadataRoute } from 'next';

import { createDb, users } from '@gatekeeper/db';

import { BRAND } from '@/lib/brand';
import {
  publishedHandleSitemapEntries,
  type SitemapProfile,
} from '@/lib/sitemap-handles';

async function loadPublishedProfiles(): Promise<SitemapProfile[]> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return [];
  try {
    const db = createDb(url);
    const rows = await db
      .select({
        handle: users.handle,
        updatedAt: users.updatedAt,
      })
      .from(users);
    return rows.map((row) => ({
      handle: row.handle,
      updatedAt: row.updatedAt,
      published: true,
    }));
  } catch {
    // Sitemap must still serve static public URLs when DB is unreachable.
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = BRAND.siteUrl;
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/start`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/ledger`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${base}/@demo`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/@demo/ledger`, lastModified: now, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const profiles = await loadPublishedProfiles();
  const handleEntries = publishedHandleSitemapEntries(profiles, base);

  // Prefer DB lastmod for /@demo when available; never duplicate URLs.
  const byUrl = new Map<string, MetadataRoute.Sitemap[number]>();
  for (const entry of staticEntries) {
    byUrl.set(entry.url, entry);
  }
  for (const entry of handleEntries) {
    const existing = byUrl.get(entry.url);
    if (existing && entry.url.endsWith('/@demo') && entry.lastModified) {
      byUrl.set(entry.url, { ...existing, lastModified: entry.lastModified });
      continue;
    }
    if (!existing) {
      byUrl.set(entry.url, entry);
    }
  }

  return [...byUrl.values()];
}
