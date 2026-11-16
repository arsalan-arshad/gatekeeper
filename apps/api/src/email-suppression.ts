import { emailSuppressions } from '@gatekeeper/db';
import { eq } from 'drizzle-orm';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { getDb } from './db.js';
import { normalizeSenderEmail } from './request-dedupe.js';

const memorySuppressions = new Map<string, { reason: string; source: string }>();
let forceMemory = false;

export function useMemoryEmailSuppressionsForTests(enabled = true): void {
  forceMemory = enabled;
  memorySuppressions.clear();
}

export function resetEmailSuppressionsForTests(): void {
  forceMemory = true;
  memorySuppressions.clear();
}

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const normalized = normalizeSenderEmail(email);
  if (!normalized) return false;

  if (forceMemory || !process.env.DATABASE_URL) {
    return memorySuppressions.has(normalized);
  }

  const db = getDb();
  const [row] = await db
    .select({ email: emailSuppressions.email })
    .from(emailSuppressions)
    .where(eq(emailSuppressions.email, normalized))
    .limit(1);
  return Boolean(row);
}

export async function recordEmailSuppression(input: {
  email: string;
  reason: 'bounce' | 'complaint' | string;
  source?: string;
  payload?: string | null;
}): Promise<void> {
  const normalized = normalizeSenderEmail(input.email);
  if (!normalized) return;

  if (forceMemory || !process.env.DATABASE_URL) {
    memorySuppressions.set(normalized, {
      reason: input.reason,
      source: input.source ?? 'resend',
    });
    return;
  }

  const db = getDb();
  await db
    .insert(emailSuppressions)
    .values({
      email: normalized,
      reason: input.reason,
      source: input.source ?? 'resend',
      payload: input.payload ?? null,
    })
    .onConflictDoUpdate({
      target: emailSuppressions.email,
      set: {
        reason: input.reason,
        source: input.source ?? 'resend',
        payload: input.payload ?? null,
      },
    });
}

/** Reject Svix timestamps older/newer than this (seconds). */
export const RESEND_WEBHOOK_TOLERANCE_SEC = 5 * 60;

export type SvixWebhookHeaders = {
  id?: string;
  timestamp?: string;
  signature?: string;
};

/** Decode Resend/Svix `whsec_…` (or raw base64) signing secret to key bytes. */
export function decodeResendWebhookSecret(secret: string): Buffer {
  const trimmed = secret.trim();
  const payload = trimmed.startsWith('whsec_') ? trimmed.slice('whsec_'.length) : trimmed;
  return Buffer.from(payload, 'base64');
}

/**
 * Verify Resend webhooks (Svix): HMAC-SHA256 over `{id}.{timestamp}.{rawBody}`,
 * compared to any `v1,…` token in `svix-signature`. Rejects timestamps outside ±5 min.
 */
export function verifyResendWebhookSignature(
  rawBody: string,
  headers: SvixWebhookHeaders,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  const id = headers.id?.trim();
  const timestamp = headers.timestamp?.trim();
  const signatureHeader = headers.signature?.trim();
  if (!id || !timestamp || !signatureHeader || !secret) return false;

  if (!/^\d+$/.test(timestamp)) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(nowSec - ts) > RESEND_WEBHOOK_TOLERANCE_SEC) return false;

  let secretBytes: Buffer;
  try {
    secretBytes = decodeResendWebhookSecret(secret);
  } catch {
    return false;
  }
  if (secretBytes.length === 0) return false;

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', secretBytes).update(signedContent).digest('base64');
  const expectedBuf = Buffer.from(expected);

  for (const part of signatureHeader.split(' ')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith('v1,')) continue;
    const provided = trimmed.slice(3);
    const providedBuf = Buffer.from(provided);
    if (providedBuf.length !== expectedBuf.length) continue;
    if (timingSafeEqual(providedBuf, expectedBuf)) return true;
  }
  return false;
}

export type ResendWebhookEvent = {
  type?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    bounce?: { message?: string };
    complaint?: { message?: string };
  };
};

export function extractSuppressionFromResendEvent(
  event: ResendWebhookEvent,
): { email: string; reason: 'bounce' | 'complaint' } | null {
  const type = event.type ?? '';
  const reason: 'bounce' | 'complaint' | null =
    type === 'email.bounced' || type.endsWith('.bounced') || type.includes('bounce')
      ? 'bounce'
      : type === 'email.complained' || type.endsWith('.complained') || type.includes('complain')
        ? 'complaint'
        : null;
  if (!reason) return null;

  const to = event.data?.to;
  const email = Array.isArray(to) ? to[0] : typeof to === 'string' ? to : undefined;
  if (!email) return null;
  return { email, reason };
}
