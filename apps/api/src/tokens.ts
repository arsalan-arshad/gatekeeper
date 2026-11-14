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

function getSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.AUTH_SECRET?.trim() || env.EMAIL_LINK_SECRET?.trim();
  if (!secret) {
    // Deterministic local fallback so signed links work in dev without secrets.
    return 'gatekeeper-dev-email-link-secret';
  }
  return secret;
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
  const signature = sign(body, getSecret(options?.env));
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

  if (!verifySignature(body, signature, getSecret(options?.env))) {
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
  return `${body}.${sign(body, getSecret(options?.env))}`;
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

  if (!verifySignature(body, signature, getSecret(options?.env))) {
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
