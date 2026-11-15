import { createHmac, timingSafeEqual } from 'node:crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';

/** Max token lifetime (seconds). Prefer short-lived. */
export const INTERNAL_TOKEN_MAX_TTL_SECONDS = 60;

const PROTECTED_PREFIXES = [
  '/v1/dashboard',
  '/v1/api-keys',
  '/v1/keys',
  '/v1/onboarding',
  '/v1/payments',
] as const;

const UNPROTECTED_EXACT = new Set(['/v1/payments/webhooks/lemon', '/v1/webhooks/resend']);

export type InternalTokenPayload = {
  sub: string;
  exp: number;
  iat: number;
};

export type VerifyInternalTokenResult =
  { ok: true; email: string; payload: InternalTokenPayload } | { ok: false; error: string };

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeB64urlJson<T>(part: string): T | null {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function safeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function getInternalApiSecret(): string | null {
  const secret = process.env.INTERNAL_API_SECRET?.trim();
  return secret || null;
}

/**
 * Create a short-lived HS256 JWT. `sub` is the signed-in user email.
 * `ttlSeconds` is capped at {@link INTERNAL_TOKEN_MAX_TTL_SECONDS}.
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
  } satisfies InternalTokenPayload);
  const data = `${header}.${payload}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyInternalToken(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): VerifyInternalTokenResult {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, error: 'Invalid token' };
  }
  const [headerB64, payloadB64, sig] = parts;
  if (!headerB64 || !payloadB64 || !sig) {
    return { ok: false, error: 'Invalid token' };
  }

  const header = decodeB64urlJson<{ alg?: string; typ?: string }>(headerB64);
  if (!header || header.alg !== 'HS256') {
    return { ok: false, error: 'Invalid token' };
  }

  const data = `${headerB64}.${payloadB64}`;
  const expected = createHmac('sha256', secret).update(data).digest('base64url');
  if (!safeEqualString(sig, expected)) {
    return { ok: false, error: 'Invalid token' };
  }

  const payload = decodeB64urlJson<InternalTokenPayload>(payloadB64);
  if (!payload || typeof payload.sub !== 'string' || typeof payload.exp !== 'number') {
    return { ok: false, error: 'Invalid token' };
  }

  const email = payload.sub.trim().toLowerCase();
  if (!email.includes('@')) {
    return { ok: false, error: 'Invalid token' };
  }

  if (payload.exp <= nowSeconds) {
    return { ok: false, error: 'Token expired' };
  }

  // Reject tokens minted with a lifetime longer than our max (clock-skew resistant check).
  if (
    typeof payload.iat === 'number' &&
    payload.exp - payload.iat > INTERNAL_TOKEN_MAX_TTL_SECONDS
  ) {
    return { ok: false, error: 'Invalid token' };
  }

  return { ok: true, email, payload };
}

export function isInternalAuthProtectedPath(urlPath: string): boolean {
  const path = urlPath.split('?')[0] ?? urlPath;
  if (UNPROTECTED_EXACT.has(path)) return false;
  return PROTECTED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function bearerToken(authorization: string | string[] | undefined): string | null {
  const raw = Array.isArray(authorization) ? authorization[0] : authorization;
  if (typeof raw !== 'string') return null;
  const match = /^Bearer\s+(\S+)$/i.exec(raw.trim());
  return match?.[1] ?? null;
}

/**
 * Fastify preHandler: require a valid short-lived internal JWT on protected routes.
 * Sets `request.gatekeeperEmail` from the token `sub`. Never trusts `x-user-email`.
 */
export async function requireInternalAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // CORS preflight must not require a JWT; the real request still does.
  if (request.method === 'OPTIONS') return;

  const path = request.url.split('?')[0] ?? request.url;
  if (!isInternalAuthProtectedPath(path)) return;

  const secret = getInternalApiSecret();
  if (!secret) {
    return reply.status(503).send({ error: 'INTERNAL_API_SECRET not configured' });
  }

  const token = bearerToken(request.headers.authorization);
  if (!token) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const verified = verifyInternalToken(token, secret);
  if (!verified.ok) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  request.gatekeeperEmail = verified.email;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Email from verified internal JWT (`sub`). Set by {@link requireInternalAuth}. */
    gatekeeperEmail?: string;
  }
}
