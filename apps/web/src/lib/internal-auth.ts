import { createHmac } from 'node:crypto';

/** Must match apps/api/src/internal-auth.ts */
export const INTERNAL_TOKEN_MAX_TTL_SECONDS = 60;

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/**
 * Short-lived HS256 JWT for server→API calls. Never import from client components.
 * Secret must be INTERNAL_API_SECRET (never NEXT_PUBLIC_*).
 */
export function signInternalToken(
  email: string,
  secret: string,
  ttlSeconds: number = INTERNAL_TOKEN_MAX_TTL_SECONDS,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) {
    throw new Error('Internal token sub must be an email');
  }
  const ttl = Math.min(Math.max(1, Math.floor(ttlSeconds)), INTERNAL_TOKEN_MAX_TTL_SECONDS);
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const payload = b64urlJson({
    sub: normalized,
    iat: nowSeconds,
    exp: nowSeconds + ttl,
  });
  const data = `${header}.${payload}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function getInternalApiSecret(): string {
  const secret = process.env.INTERNAL_API_SECRET?.trim();
  if (!secret) {
    throw new Error('INTERNAL_API_SECRET is not configured');
  }
  // Defense in depth: never allow a NEXT_PUBLIC_ secret name to be used by mistake.
  if (secret.startsWith('NEXT_PUBLIC_')) {
    throw new Error('INTERNAL_API_SECRET must not use a NEXT_PUBLIC_ value');
  }
  return secret;
}
