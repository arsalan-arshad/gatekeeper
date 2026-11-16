import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { stripTrailingSlashForRedirect } from '@/lib/trailing-slash';

/**
 * Paths that are intentionally indexable. Everything else gets
 * `X-Robots-Tag: noindex, nofollow` (dashboard/auth/404s). Profile URLs are
 * included so real `/@handle` pages stay indexable; missing handles still get
 * Next's automatic 404 `noindex` meta (without a duplicate robots tag).
 */
const INDEXABLE_PATH = /^\/(?:|start|ledger|privacy|terms|@[a-z0-9_.-]+(?:\/ledger)?)$/i;

/**
 * With `skipTrailingSlashRedirect: true` (required so PostHog `/ingest/.../`
 * POSTs are not 308'd — sendBeacon does not follow them), restore slash-stripping
 * for everything else so `/start/` and `/ledger/` still 308 to the no-slash URL.
 *
 * Matcher excludes `/ingest` so the PostHog rewrite keeps the trailing slash.
 */
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const stripped = stripTrailingSlashForRedirect(pathname);
  if (stripped) {
    // Use plain URL — NextURL clone can preserve a trailing-slash href.
    const destination = new URL(stripped + search, request.nextUrl.origin);
    return NextResponse.redirect(destination, 308);
  }

  const response = NextResponse.next();
  if (!INDEXABLE_PATH.test(pathname)) {
    // Supplies nofollow for 404 HTML without a second `<meta name="robots">`
    // (Next already injects `noindex` on not-found).
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  return response;
}

export const config = {
  // Do not run on `/ingest` (PostHog proxy) or static assets.
  matcher: [
    '/((?!ingest|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
};
