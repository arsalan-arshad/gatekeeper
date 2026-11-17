/**
 * Paths that are intentionally indexable. Everything else gets
 * `X-Robots-Tag: noindex, nofollow` (dashboard/auth/404s).
 *
 * Dynamic `/@handle` profile URLs are handled separately: valid handles stay
 * indexable; missing handles get noindex,nofollow once existence is known.
 */
export const STATIC_INDEXABLE_PATH = /^\/(?:|start|ledger|explore|privacy|terms)$/i;

const PROFILE_PATH = /^\/@([a-z0-9_.-]+)(\/ledger)?$/i;

export function matchPublicProfilePath(
  pathname: string,
): { handle: string; isLedger: boolean } | null {
  const match = PROFILE_PATH.exec(pathname);
  if (!match?.[1]) return null;
  return { handle: match[1].toLowerCase(), isLedger: Boolean(match[2]) };
}

/**
 * Decide whether to send `X-Robots-Tag: noindex, nofollow`.
 *
 * For `/@handle` (and `/@handle/ledger`), pass `handleExists`:
 * - `true` → indexable (no header)
 * - `false` → unknown handle 404 → noindex,nofollow
 * - `null`/`undefined` → existence unknown; do not noindex (avoid blocking real profiles when the API is down)
 */
export function shouldSetNoindexNofollow(pathname: string, handleExists?: boolean | null): boolean {
  const profile = matchPublicProfilePath(pathname);
  if (profile) {
    return handleExists === false;
  }
  return !STATIC_INDEXABLE_PATH.test(pathname);
}

export const NOINDEX_NOFOLLOW = 'noindex, nofollow';
