import { timingSafeEqual } from 'node:crypto';

export type AdminAuthFailure = {
  ok: false;
  status: 401 | 503;
  error: string;
};

export type AdminAuthSuccess = { ok: true };

export type AdminAuthResult = AdminAuthSuccess | AdminAuthFailure;

type AdminAuthRequest = {
  query?: unknown;
  headers: { authorization?: string | string[] | undefined };
};

function tokensEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Admin gate for `/health/llm` and `/admin/cache/clear`.
 *
 * - Env: `ADMIN_TOKEN` (trimmed; missing → 503)
 * - **Bearer only** — `Authorization: Bearer <token>` (never `?token=` query)
 */
export function checkAdminToken(request: AdminAuthRequest): AdminAuthResult {
  const adminToken = process.env.ADMIN_TOKEN?.trim();
  if (!adminToken) {
    return { ok: false, status: 503, error: 'ADMIN_TOKEN not configured' };
  }

  const rawAuth = request.headers.authorization;
  const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
  let fromBearer = '';
  if (typeof authHeader === 'string') {
    const match = /^Bearer\s+(\S.*)$/i.exec(authHeader.trim());
    if (match?.[1]) fromBearer = match[1].trim();
  }

  if (!fromBearer || !tokensEqual(fromBearer, adminToken)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}
