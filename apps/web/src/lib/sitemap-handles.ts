import type { MetadataRoute } from 'next';

/**
 * Seeded demo-only profiles (see packages/db seed / DEMO_LEDGER_HANDLES).
 * Keep `/@demo` in the sitemap; exclude the rest of the demo set.
 */
export const SITEMAP_DEMO_ONLY_HANDLES = new Set(['ada', 'jonas', 'mira']);

export type SitemapProfile = {
  handle: string;
  updatedAt: Date | string;
  /** Defaults to true when omitted. */
  published?: boolean;
  /** Soft-deleted rows — excluded when true. */
  deleted?: boolean;
};

/** True when a profile should appear as `/@handle` in the public sitemap. */
export function shouldIncludeHandleInSitemap(profile: SitemapProfile): boolean {
  if (profile.deleted) return false;
  if (profile.published === false) return false;
  const handle = profile.handle.trim().toLowerCase();
  if (!handle) return false;
  if (handle === 'demo') return true;
  if (SITEMAP_DEMO_ONLY_HANDLES.has(handle)) return false;
  return true;
}

/**
 * Build `/@handle` sitemap entries from published profiles.
 * Does not emit `/@handle/ledger` (only `/@demo/ledger` is indexable today).
 */
export function publishedHandleSitemapEntries(
  profiles: SitemapProfile[],
  baseUrl: string,
): MetadataRoute.Sitemap {
  const base = baseUrl.replace(/\/$/, '');
  const seen = new Set<string>();
  const entries: MetadataRoute.Sitemap = [];

  for (const profile of profiles) {
    if (!shouldIncludeHandleInSitemap(profile)) continue;
    const handle = profile.handle.trim().toLowerCase();
    if (seen.has(handle)) continue;
    seen.add(handle);
    const lastModified =
      profile.updatedAt instanceof Date ? profile.updatedAt : new Date(profile.updatedAt);
    entries.push({
      url: `${base}/@${handle}`,
      lastModified: Number.isNaN(lastModified.getTime()) ? new Date() : lastModified,
      changeFrequency: 'weekly',
      priority: handle === 'demo' ? 0.7 : 0.6,
    });
  }

  return entries;
}
