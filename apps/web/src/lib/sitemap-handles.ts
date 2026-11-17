import type { MetadataRoute } from 'next';

/**
 * Seeded demo-only profiles (see packages/db seed / DEMO_LEDGER_HANDLES).
 * Keep `/@demo` in the sitemap; exclude the rest of the demo set.
 */
export const SITEMAP_DEMO_ONLY_HANDLES = new Set(['ada', 'jonas', 'mira']);

/**
 * Explicit junk / throwaway handles that must never appear in the sitemap
 * (case-insensitive). Prefer patterns below when possible; use this for
 * one-off handles that do not match `e2e*` or `test*-gk`.
 */
export const SITEMAP_EXCLUDED_HANDLES = new Set(['arsalan-a-software-engin']);

/** Matches Playwright / e2e-login handles (`e2ehzyrvm`, `e2eti1ypaz`, …). */
const E2E_HANDLE_RE = /^e2e/;

/** Matches manual QA handles like `testfounder-gk`, `testuser2-gk`. */
const TEST_GK_HANDLE_RE = /^test.*-gk$/;

export type SitemapProfile = {
  handle: string;
  updatedAt: Date | string;
  /** Defaults to true when omitted. */
  published?: boolean;
  /** Soft-deleted rows — excluded when true. */
  deleted?: boolean;
};

/**
 * True for ephemeral/test/junk handles that must stay out of the public sitemap.
 * Patterns (not one-off lists) so future e2e / QA accounts stay excluded:
 * - `e2e*` prefix
 * - `test*-gk`
 * - explicit {@link SITEMAP_EXCLUDED_HANDLES}
 */
export function isExcludedTestOrJunkHandle(handle: string): boolean {
  const h = handle.trim().toLowerCase();
  if (!h) return true;
  if (SITEMAP_EXCLUDED_HANDLES.has(h)) return true;
  if (E2E_HANDLE_RE.test(h)) return true;
  if (TEST_GK_HANDLE_RE.test(h)) return true;
  return false;
}

/** True when a profile should appear as `/@handle` in the public sitemap. */
export function shouldIncludeHandleInSitemap(profile: SitemapProfile): boolean {
  if (profile.deleted) return false;
  if (profile.published === false) return false;
  const handle = profile.handle.trim().toLowerCase();
  if (!handle) return false;
  if (handle === 'demo') return true;
  if (SITEMAP_DEMO_ONLY_HANDLES.has(handle)) return false;
  if (isExcludedTestOrJunkHandle(handle)) return false;
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
