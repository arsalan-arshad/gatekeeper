import { createHmac, timingSafeEqual } from 'node:crypto';

export type OptInAction = 'accept' | 'decline';

export type OptInTokenPayload = {
  requestId: string;
  action: OptInAction;
  exp: number;
};

export type HelpfulTokenPayload = {
  requestId: string;
  helpful: boolean;
  exp: number;
};

export type MatchAction = 'accept' | 'decline';

export type MatchTokenPayload = {
  matchId: string;
  action: MatchAction;
  exp: number;
};

export const EMAIL_LINK_SECRET_MIN_LENGTH = 32;

/**
 * Resolve signing secret for opt-in / helpful links.
 * Never falls back to a hardcoded default — missing or short secrets throw.
 */
export function resolveEmailLinkSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.EMAIL_LINK_SECRET?.trim() || env.AUTH_SECRET?.trim() || '';
  if (!secret || secret.length < EMAIL_LINK_SECRET_MIN_LENGTH) {
    throw new Error(
      `EMAIL_LINK_SECRET or AUTH_SECRET must be set and at least ${EMAIL_LINK_SECRET_MIN_LENGTH} characters`,
    );
  }
  return secret;
}

/** Fail process startup when email-link signing secret is missing/short. */
export function assertEmailLinkSecretConfigured(env: NodeJS.ProcessEnv = process.env): void {
  resolveEmailLinkSecret(env);
}

function encodeJson(payload: object): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expectedSig = sign(body, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSig);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createOptInToken(
  payload: Omit<OptInTokenPayload, 'exp'> & { exp?: number },
  options?: { env?: NodeJS.ProcessEnv; ttlSeconds?: number; now?: number },
): string {
  const ttlSeconds = options?.ttlSeconds ?? 60 * 60 * 72; // 72h
  const now = options?.now ?? Math.floor(Date.now() / 1000);
  const full: OptInTokenPayload = {
    requestId: payload.requestId,
    action: payload.action,
    exp: payload.exp ?? now + ttlSeconds,
  };
  const body = encodeJson(full);
  const signature = sign(body, resolveEmailLinkSecret(options?.env));
  return `${body}.${signature}`;
}

export function verifyOptInToken(
  token: string,
  expected: { requestId: string; action: OptInAction },
  options?: { env?: NodeJS.ProcessEnv; now?: number },
): { ok: true; payload: OptInTokenPayload } | { ok: false; error: string } {
  const [body, signature] = token.split('.');
  if (!body || !signature) {
    return { ok: false, error: 'Malformed token' };
  }

  let secret: string;
  try {
    secret = resolveEmailLinkSecret(options?.env);
  } catch {
    return { ok: false, error: 'Signing secret not configured' };
  }

  if (!verifySignature(body, signature, secret)) {
    return { ok: false, error: 'Invalid signature' };
  }

  let payload: OptInTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OptInTokenPayload;
  } catch {
    return { ok: false, error: 'Invalid payload' };
  }

  if (!payload.requestId || (payload.action !== 'accept' && payload.action !== 'decline')) {
    return { ok: false, error: 'Invalid payload' };
  }

  const now = options?.now ?? Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) {
    return { ok: false, error: 'Token expired' };
  }

  if (payload.requestId !== expected.requestId || payload.action !== expected.action) {
    return { ok: false, error: 'Token mismatch' };
  }

  return { ok: true, payload };
}

export function createHelpfulToken(
  payload: Omit<HelpfulTokenPayload, 'exp'> & { exp?: number },
  options?: { env?: NodeJS.ProcessEnv; ttlSeconds?: number; now?: number },
): string {
  const ttlSeconds = options?.ttlSeconds ?? 60 * 60 * 24 * 30; // 30d
  const now = options?.now ?? Math.floor(Date.now() / 1000);
  const full: HelpfulTokenPayload = {
    requestId: payload.requestId,
    helpful: payload.helpful,
    exp: payload.exp ?? now + ttlSeconds,
  };
  const body = encodeJson(full);
  return `${body}.${sign(body, resolveEmailLinkSecret(options?.env))}`;
}

export function verifyHelpfulToken(
  token: string,
  expected: { requestId: string; helpful: boolean },
  options?: { env?: NodeJS.ProcessEnv; now?: number },
): { ok: true; payload: HelpfulTokenPayload } | { ok: false; error: string } {
  const [body, signature] = token.split('.');
  if (!body || !signature) {
    return { ok: false, error: 'Malformed token' };
  }

  let secret: string;
  try {
    secret = resolveEmailLinkSecret(options?.env);
  } catch {
    return { ok: false, error: 'Signing secret not configured' };
  }

  if (!verifySignature(body, signature, secret)) {
    return { ok: false, error: 'Invalid signature' };
  }

  let payload: HelpfulTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as HelpfulTokenPayload;
  } catch {
    return { ok: false, error: 'Invalid payload' };
  }

  if (!payload.requestId || typeof payload.helpful !== 'boolean') {
    return { ok: false, error: 'Invalid payload' };
  }

  const now = options?.now ?? Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) {
    return { ok: false, error: 'Token expired' };
  }

  if (payload.requestId !== expected.requestId || payload.helpful !== expected.helpful) {
    return { ok: false, error: 'Token mismatch' };
  }

  return { ok: true, payload };
}

export function createMatchToken(
  payload: Omit<MatchTokenPayload, 'exp'> & { exp?: number },
  options?: { env?: NodeJS.ProcessEnv; ttlSeconds?: number; now?: number },
): string {
  // Align with MATCH_EXPIRES_DAYS (14) so email Accept/Decline links remain
  // usable for the full pending match lifetime.
  const ttlSeconds = options?.ttlSeconds ?? 60 * 60 * 24 * 14;
  const now = options?.now ?? Math.floor(Date.now() / 1000);
  const full: MatchTokenPayload = {
    matchId: payload.matchId,
    action: payload.action,
    exp: payload.exp ?? now + ttlSeconds,
  };
  const body = encodeJson(full);
  const signature = sign(body, resolveEmailLinkSecret(options?.env));
  return `${body}.${signature}`;
}

export function verifyMatchToken(
  token: string,
  expected: { matchId: string; action: MatchAction },
  options?: { env?: NodeJS.ProcessEnv; now?: number },
): { ok: true; payload: MatchTokenPayload } | { ok: false; error: string } {
  const [body, signature] = token.split('.');
  if (!body || !signature) {
    return { ok: false, error: 'Malformed token' };
  }

  let secret: string;
  try {
    secret = resolveEmailLinkSecret(options?.env);
  } catch {
    return { ok: false, error: 'Signing secret not configured' };
  }

  if (!verifySignature(body, signature, secret)) {
    return { ok: false, error: 'Invalid signature' };
  }

  let payload: MatchTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as MatchTokenPayload;
  } catch {
    return { ok: false, error: 'Invalid payload' };
  }

  if (!payload.matchId || (payload.action !== 'accept' && payload.action !== 'decline')) {
    return { ok: false, error: 'Invalid payload' };
  }

  const now = options?.now ?? Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) {
    return { ok: false, error: 'Token expired' };
  }

  if (payload.matchId !== expected.matchId || payload.action !== expected.action) {
    return { ok: false, error: 'Token mismatch' };
  }

  return { ok: true, payload };
}
