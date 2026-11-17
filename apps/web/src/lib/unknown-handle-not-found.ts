import { NOINDEX_NOFOLLOW } from './robots-header';

/** Internal path rendered as a soft 200 with robots noindex,nofollow. */
export const HANDLE_NOT_FOUND_PATH = '/handle-not-found';

/** Set on the internal subrequest so middleware does not recurse. */
export const INTERNAL_HANDLE_NOT_FOUND_HEADER = 'x-gk-handle-not-found';

const ROBOTS_META_RE = /<meta\b[^>]*\bname\s*=\s*["']robots["'][^>]*>/gi;
const ROBOTS_CONTENT_RE = /\bcontent\s*=\s*["']([^"']*)["']/i;

/** Collect `content` values of every `<meta name="robots">` in HTML. */
export function robotsMetaContents(html: string): string[] {
  const contents: string[] = [];
  for (const match of html.matchAll(ROBOTS_META_RE)) {
    const tag = match[0] ?? '';
    const content = ROBOTS_CONTENT_RE.exec(tag)?.[1]?.trim() ?? '';
    contents.push(content);
  }
  return contents;
}

/** True when HTML has exactly one robots meta and it is `noindex, nofollow`. */
export function hasExactNoindexNofollowRobotsMeta(html: string): boolean {
  const contents = robotsMetaContents(html);
  return contents.length === 1 && contents[0] === NOINDEX_NOFOLLOW;
}

const MINIMAL_404_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="robots" content="noindex, nofollow"/><title>Not found · Gatekeeper</title></head><body><h1>This door doesn't exist</h1><p><a href="/">Back home</a></p></body></html>`;

/**
 * Fetch the soft `/handle-not-found` document (status 200, one robots meta)
 * and re-wrap it as HTTP 404 with `X-Robots-Tag: noindex, nofollow`.
 *
 * Serving via middleware Response avoids Next's automatic `noindex`-only meta
 * that fires for status > 400 during app-render.
 */
export async function buildUnknownHandleNotFoundResponse(options: {
  origin: string;
  fetchImpl?: typeof fetch;
}): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = new URL(HANDLE_NOT_FOUND_PATH, options.origin);

  try {
    const upstream = await fetchImpl(url, {
      headers: { [INTERNAL_HANDLE_NOT_FOUND_HEADER]: '1' },
      redirect: 'manual',
      cache: 'no-store',
    });
    if (upstream.ok) {
      const html = await upstream.text();
      return new Response(html, {
        status: 404,
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') ?? 'text/html; charset=utf-8',
          'X-Robots-Tag': NOINDEX_NOFOLLOW,
        },
      });
    }
  } catch {
    /* fall through to minimal HTML */
  }

  return new Response(MINIMAL_404_HTML, {
    status: 404,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Robots-Tag': NOINDEX_NOFOLLOW,
    },
  });
}
