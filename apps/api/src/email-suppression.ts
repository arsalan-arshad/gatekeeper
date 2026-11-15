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

/** HMAC-SHA256 hex of raw body — used when Resend/Svix full verify is not wired. */
export function verifyResendWebhookSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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
