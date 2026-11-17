import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { API_URL } from '@/lib/api-url';
import {
  NOINDEX_NOFOLLOW,
  matchPublicProfilePath,
  shouldSetNoindexNofollow,
} from '@/lib/robots-header';
import { stripTrailingSlashForRedirect } from '@/lib/trailing-slash';
import {
  HANDLE_NOT_FOUND_PATH,
  INTERNAL_HANDLE_NOT_FOUND_HEADER,
  buildUnknownHandleNotFoundResponse,
} from '@/lib/unknown-handle-not-found';

/**
 * With `skipTrailingSlashRedirect: true` (required so PostHog `/ingest/.../`
 * POSTs are not 308'd — sendBeacon does not follow them), restore slash-stripping
 * for everything else so `/start/` and `/ledger/` still 308 to the no-slash URL.
 *
 * Matcher excludes `/ingest` so the PostHog rewrite keeps the trailing slash.
 *
 * Unknown `/@handle`: middleware returns a hard 404 by re-wrapping the soft
 * `/handle-not-found` HTML (exactly one `<meta name="robots" content="noindex, nofollow">`)
 * plus `X-Robots-Tag: noindex, nofollow`. Valid handles stay indexable.
 */
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Internal subrequest used to render the soft 404 document — do not recurse.
  if (request.headers.get(INTERNAL_HANDLE_NOT_FOUND_HEADER) === '1') {
    const response = NextResponse.next();
    response.headers.set('X-Robots-Tag', NOINDEX_NOFOLLOW);
    return response;
  }

  if (pathname === HANDLE_NOT_FOUND_PATH) {
    const response = NextResponse.next();
    response.headers.set('X-Robots-Tag', NOINDEX_NOFOLLOW);
    return response;
  }

  const stripped = stripTrailingSlashForRedirect(pathname);
  if (stripped) {
    // Use plain URL — NextURL clone can preserve a trailing-slash href.
    const destination = new URL(stripped + search, request.nextUrl.origin);
    return NextResponse.redirect(destination, 308);
  }

  const profile = matchPublicProfilePath(pathname);
  if (profile) {
    const handleExists = await publicHandleExists(profile.handle);
    if (handleExists === false) {
      return buildUnknownHandleNotFoundResponse({ origin: request.nextUrl.origin });
    }
    // Valid (or unknown): leave indexable — no X-Robots-Tag.
    return NextResponse.next();
  }

  const response = NextResponse.next();
  if (shouldSetNoindexNofollow(pathname)) {
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
