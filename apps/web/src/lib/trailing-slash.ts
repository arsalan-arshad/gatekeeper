/**
 * Public paths that historically relied on Next's default trailing-slash 308.
 * Kept as documentation + unit coverage; runtime stripping lives in middleware
 * (everything except `/ingest`, which must keep trailing slashes for PostHog).
 */
export const PUBLIC_TRAILING_SLASH_EXAMPLES = [
  { from: '/start/', to: '/start' },
  { from: '/ledger/', to: '/ledger' },
  { from: '/privacy/', to: '/privacy' },
  { from: '/terms/', to: '/terms' },
] as const;

/** True when a path should keep its trailing slash (PostHog ingest proxy). */
export function shouldPreserveTrailingSlash(pathname: string): boolean {
  return pathname === '/ingest' || pathname.startsWith('/ingest/');
}

/** Strip a trailing slash unless this is an ingest proxy path. */
export function stripTrailingSlashForRedirect(pathname: string): string | null {
  if (shouldPreserveTrailingSlash(pathname)) return null;
  if (pathname.length <= 1 || !pathname.endsWith('/')) return null;
  return pathname.replace(/\/+$/, '') || '/';
}
