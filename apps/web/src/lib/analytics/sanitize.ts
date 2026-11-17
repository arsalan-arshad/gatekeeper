/** Property keys that must never leave the browser for analytics. */
const BLOCKED_KEYS = new Set([
  'email',
  'sendercontact',
  'senderContact',
  'message',
  'body',
  'token',
  'authorization',
  'password',
  'secret',
  'apikey',
  'apiKey',
  'api_key',
  'name',
  'senderName',
  'sendername',
  'reason',
  'reason_public',
  'reason_private',
  'suggested_rewrite',
  'score',
]);

function isBlockedKey(key: string): boolean {
  if (BLOCKED_KEYS.has(key)) return true;
  const lower = key.toLowerCase();
  return (
    lower.includes('email') ||
    lower.includes('token') ||
    lower.includes('password') ||
    lower.includes('secret') ||
    lower === 'authorization' ||
    lower === 'message' ||
    lower === 'body' ||
    lower === 'sendercontact' ||
    lower === 'sendername' ||
    lower === 'handle' ||
    lower === 'query' ||
    lower === 'q' ||
    lower === 'tags' ||
    lower === 'tag'
  );
}

/**
 * Drop PII / sensitive keys from analytics properties.
 * Always run before every capture path.
 */
export function sanitizeAnalyticsProps(
  props: Record<string, unknown> | undefined | null,
): Record<string, unknown> | undefined {
  if (!props) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (isBlockedKey(key)) continue;
    if (value == null) continue;
    if (typeof value === 'object') continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Strip email-like query params from a path+search string before $pageview. */
export function sanitizeAnalyticsPath(pathWithSearch: string): string {
  const qIndex = pathWithSearch.indexOf('?');
  if (qIndex === -1) return pathWithSearch;
  const path = pathWithSearch.slice(0, qIndex);
  const params = new URLSearchParams(pathWithSearch.slice(qIndex + 1));
  for (const key of [...params.keys()]) {
    const lower = key.toLowerCase();
    if (lower.includes('email') || lower.includes('token') || lower === 'password') {
      params.delete(key);
    }
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export type VerdictBand = 'spam' | 'reject' | 'accept';

export function bandFromDecision(decision: string | null | undefined): VerdictBand | null {
  if (decision === 'spam' || decision === 'reject' || decision === 'accept') {
    return decision;
  }
  return null;
}
