import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { API_URL } from '@/lib/api-url';
import {
  NOINDEX_NOFOLLOW,
  matchPublicProfilePath,
  shouldSetNoindexNofollow,
} from '@/lib/robots-header';
import { stripTrailingSlashForRedirect } from '@/lib/trailing-slash';

/**
 * With `skipTrailingSlashRedirect: true` (required so PostHog `/ingest/.../`
 * POSTs are not 308'd — sendBeacon does not follow them), restore slash-stripping
 * for everything else so `/start/` and `/ledger/` still 308 to the no-slash URL.
 *
 * Matcher excludes `/ingest` so the PostHog rewrite keeps the trailing slash.
 *
 * Robots: static public pages stay indexable. `/@handle` is indexable only when
 * the handle exists; unknown handles get `X-Robots-Tag: noindex, nofollow` so
 * nofollow is present even though Next's 404 meta is `noindex` only (exactly one
 * robots meta — nofollow via the header).
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const stripped = stripTrailingSlashForRedirect(pathname);
  if (stripped) {
    // Use plain URL — NextURL clone can preserve a trailing-slash href.
    const destination = new URL(stripped + search, request.nextUrl.origin);
    return NextResponse.redirect(destination, 308);
  }

  const response = NextResponse.next();
  const profile = matchPublicProfilePath(pathname);
  let handleExists: boolean | null | undefined;
  if (profile) {
    handleExists = await publicHandleExists(profile.handle);
  }

  if (shouldSetNoindexNofollow(pathname, handleExists)) {
    response.headers.set('X-Robots-Tag', NOINDEX_NOFOLLOW);
  }
  return response;
}

async function publicHandleExists(handle: string): Promise<boolean | null> {
  if (handle === 'demo') return true;
  try {
    const base = API_URL.replace(/\/$/, '');
    const response = await fetch(`${base}/v1/users/${encodeURIComponent(handle)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    if (response.status === 404) return false;
    if (response.ok) return true;
    return null;
  } catch {
    return null;
  }
}

export const config = {
  // Do not run on `/ingest` (PostHog proxy) or static assets.
  matcher: [
    '/((?!ingest|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
};
