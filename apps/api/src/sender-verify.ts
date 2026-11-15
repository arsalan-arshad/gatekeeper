import { verifiedSenders } from '@gatekeeper/db';
import { eq } from 'drizzle-orm';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { getDb } from './db.js';
import type { EmailSender } from './email.js';
import { buildSenderVerifyEmail } from './email-templates.js';
import { FixedWindowRateLimiter } from './rate-limit.js';
import { normalizeSenderEmail } from './request-dedupe.js';
import { resolveEmailLinkSecret } from './tokens.js';

/** Max outbound emails to a given senderContact per rolling day. */
export const SENDER_OUTBOUND_DAILY_LIMIT = 3;

const senderOutboundLimiter = new FixedWindowRateLimiter(
  SENDER_OUTBOUND_DAILY_LIMIT,
  24 * 60 * 60 * 1000,
);

export function resetSenderOutboundLimiterForTests(): void {
  senderOutboundLimiter.clear();
}

/** In-memory override for unit tests (avoids holding DB connections open). */
const verifiedOverride = new Set<string>();

export function setSenderVerifiedForTests(email: string | null): void {
  verifiedOverride.clear();
  if (email) verifiedOverride.add(normalizeSenderEmail(email));
}

export async function isSenderContactVerified(email: string): Promise<boolean> {
  const normalized = normalizeSenderEmail(email);
  if (!normalized) return false;
  if (verifiedOverride.has(normalized)) return true;
  const db = getDb();
  const [row] = await db
    .select({ email: verifiedSenders.email })
    .from(verifiedSenders)
    .where(eq(verifiedSenders.email, normalized))
    .limit(1);
  return Boolean(row);
}

export function createSenderVerifyToken(
  email: string,
  options?: { env?: NodeJS.ProcessEnv; ttlSeconds?: number; now?: number },
): string {
  const ttlSeconds = options?.ttlSeconds ?? 60 * 60 * 24; // 24h
  const now = options?.now ?? Math.floor(Date.now() / 1000);
  const payload = {
    email: normalizeSenderEmail(email),
    purpose: 'sender_verify' as const,
    exp: now + ttlSeconds,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const secret = resolveEmailLinkSecret(options?.env);
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifySenderVerifyToken(
  token: string,
  options?: { env?: NodeJS.ProcessEnv; now?: number },
): { ok: true; email: string } | { ok: false; error: string } {
  const [body, signature] = token.split('.');
  if (!body || !signature) return { ok: false, error: 'Malformed token' };

  let secret: string;
  try {
    secret = resolveEmailLinkSecret(options?.env);
  } catch {
    return { ok: false, error: 'Signing secret not configured' };
  }

  const expected = createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: 'Invalid signature' };
  }

  let payload: { email?: string; purpose?: string; exp?: number };
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as typeof payload;
  } catch {
    return { ok: false, error: 'Invalid payload' };
  }

  const now = options?.now ?? Math.floor(Date.now() / 1000);
  if (payload.purpose !== 'sender_verify' || typeof payload.email !== 'string') {
    return { ok: false, error: 'Invalid payload' };
  }
  if (typeof payload.exp !== 'number' || payload.exp < now) {
    return { ok: false, error: 'Token expired' };
  }
  return { ok: true, email: normalizeSenderEmail(payload.email) };
}

export async function markSenderContactVerified(email: string): Promise<void> {
  const normalized = normalizeSenderEmail(email);
  const db = getDb();
  await db
    .insert(verifiedSenders)
    .values({ email: normalized, verifiedAt: new Date() })
    .onConflictDoNothing({ target: verifiedSenders.email });
}

/**
 * Consume one outbound slot for this sender. Returns false if daily cap hit.
 * Verification emails and any other mail TO the sender share this budget.
 */
export function consumeSenderOutboundSlot(email: string): {
  ok: boolean;
  remaining: number;
  resetMs: number;
} {
  const key = `sender-out:${normalizeSenderEmail(email)}`;
  const result = senderOutboundLimiter.check(key);
  return { ok: result.ok, remaining: result.remaining, resetMs: result.resetMs };
}

export async function maybeSendSenderVerificationEmail(
  send: EmailSender,
  input: { senderEmail: string; senderName: string; env?: NodeJS.ProcessEnv },
): Promise<{ sent: boolean; reason?: string; id?: string; mode?: string }> {
  if (await isSenderContactVerified(input.senderEmail)) {
    return { sent: false, reason: 'already_verified' };
  }
  const slot = consumeSenderOutboundSlot(input.senderEmail);
  if (!slot.ok) {
    return { sent: false, reason: 'outbound_cap' };
  }

  const token = createSenderVerifyToken(input.senderEmail, { env: input.env });
  const base = (input.env?.API_URL ?? input.env?.APP_URL ?? process.env.API_URL ?? process.env.APP_URL ?? 'http://localhost:4000').replace(
    /\/$/,
    '',
  );
  const verifyUrl = `${base}/v1/senders/verify?token=${encodeURIComponent(token)}`;
  const content = buildSenderVerifyEmail({
    senderName: input.senderName,
    verifyUrl,
    env: input.env,
  });
  const result = await send({ to: input.senderEmail, ...content });
  return { sent: true, id: result.id, mode: result.mode };
}

/**
 * Gate for any email addressed to senderContact (reject / decline / intro).
 * Does not consume the outbound quota — call consumeSenderOutboundSlot when sending.
 */
export async function canEmailSenderContact(email: string): Promise<{
  ok: boolean;
  reason?: 'unverified' | 'outbound_cap';
}> {
  if (!(await isSenderContactVerified(email))) {
    return { ok: false, reason: 'unverified' };
  }
  const key = `sender-out:${normalizeSenderEmail(email)}`;
  const peek = senderOutboundLimiter.peek(key);
  if (!peek.ok) return { ok: false, reason: 'outbound_cap' };
  return { ok: true };
}
