import { outboundEmails } from '@gatekeeper/db';

import { getDb } from './db.js';

/** Unique email kinds keyed with request id for send idempotency. */
export const OUTBOUND_EMAIL_TYPES = {
  introConnected: 'intro_connected',
  declineAutoReply: 'decline_auto_reply',
} as const;

export type OutboundEmailType = (typeof OUTBOUND_EMAIL_TYPES)[keyof typeof OUTBOUND_EMAIL_TYPES];

const memorySlots = new Set<string>();
let forceMemory = false;

function slotKey(requestId: string, emailType: string): string {
  return `${requestId}::${emailType}`;
}

export function useMemoryOutboundEmailsForTests(enabled = true): void {
  forceMemory = enabled;
  memorySlots.clear();
}

export function resetOutboundEmailsForTests(): void {
  forceMemory = true;
  memorySlots.clear();
}

export function countOutboundEmailsForTests(emailType?: string): number {
  if (!emailType) return memorySlots.size;
  let n = 0;
  for (const key of memorySlots) {
    if (key.endsWith(`::${emailType}`)) n += 1;
  }
  return n;
}

/**
 * Idempotency guard: INSERT … ON CONFLICT DO NOTHING RETURNING *.
 * Send the email only when claimed === true.
 */
export async function claimOutboundEmailSlot(input: {
  requestId: string;
  emailType: OutboundEmailType | string;
}): Promise<{ claimed: boolean }> {
  if (forceMemory || !process.env.DATABASE_URL) {
    const key = slotKey(input.requestId, input.emailType);
    if (memorySlots.has(key)) return { claimed: false };
    memorySlots.add(key);
    return { claimed: true };
  }

  const db = getDb();
  const inserted = await db
    .insert(outboundEmails)
    .values({
      requestId: input.requestId,
      emailType: input.emailType,
    })
    .onConflictDoNothing({
      target: [outboundEmails.requestId, outboundEmails.emailType],
    })
    .returning({
      requestId: outboundEmails.requestId,
      emailType: outboundEmails.emailType,
    });

  return { claimed: inserted.length > 0 };
}
