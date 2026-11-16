const BLOCKED = new Set([
  'email',
  'sendercontact',
  'senderContact',
  'message',
  'body',
  'token',
  'authorization',
  'password',
  'secret',
  'name',
  'senderName',
  'reason',
  'reason_public',
  'reason_private',
  'suggested_rewrite',
  'score',
  'handle',
]);

function blocked(key: string): boolean {
  if (BLOCKED.has(key)) return true;
  const lower = key.toLowerCase();
  return (
    lower.includes('email') ||
    lower.includes('token') ||
    lower.includes('password') ||
    lower.includes('secret') ||
    lower === 'message' ||
    lower === 'body' ||
    lower === 'handle'
  );
}

export function sanitizeServerAnalyticsProps(
  props: Record<string, unknown> | undefined | null,
): Record<string, unknown> | undefined {
  if (!props) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (blocked(key)) continue;
    if (value == null) continue;
    if (typeof value === 'object') continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
