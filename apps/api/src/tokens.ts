import { createHmac, timingSafeEqual } from 'node:crypto';

export type OptInAction = 'accept' | 'decline';

export type OptInTokenPayload = {
  requestId: string;
  action: OptInAction;
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

function encode(payload: OptInTokenPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decode(raw: string): OptInTokenPayload | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as OptInTokenPayload;
    if (!parsed.requestId || (parsed.action !== 'accept' && parsed.action !== 'decline')) {
      return null;
    }
    if (typeof parsed.exp !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
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
  const body = encode(full);
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

  const expectedSig = sign(body, getSecret(options?.env));
  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: 'Invalid signature' };
  }

  const payload = decode(body);
  if (!payload) {
    return { ok: false, error: 'Invalid payload' };
  }

  const now = options?.now ?? Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    return { ok: false, error: 'Token expired' };
  }

  if (payload.requestId !== expected.requestId || payload.action !== expected.action) {
    return { ok: false, error: 'Token mismatch' };
  }

  return { ok: true, payload };
}
