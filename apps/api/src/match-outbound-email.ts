import { matchOutboundEmails } from '@gatekeeper/db';
import { and, eq } from 'drizzle-orm';

import { getDb } from './db.js';

export const MATCH_EMAIL_TYPES = {
  matchIntro: 'match_intro',
  matchRequestNotify: 'match_request_notify',
} as const;

export type MatchEmailType = (typeof MATCH_EMAIL_TYPES)[keyof typeof MATCH_EMAIL_TYPES];

const memorySlots = new Set<string>();
let forceMemory = false;

function slotKey(matchId: string, emailType: string): string {
  return `${matchId}::${emailType}`;
}

export function useMemoryMatchOutboundEmailsForTests(enabled = true): void {
  forceMemory = enabled;
  memorySlots.clear();
}

export function resetMatchOutboundEmailsForTests(): void {
  forceMemory = true;
  memorySlots.clear();
}

export function countMatchOutboundEmailsForTests(emailType?: string): number {
  if (!emailType) return memorySlots.size;
  let n = 0;
  for (const key of memorySlots) {
    if (key.endsWith(`::${emailType}`)) n += 1;
  }
  return n;
}

export async function claimMatchEmailSlot(input: {
  matchId: string;
  emailType: MatchEmailType | string;
}): Promise<{ claimed: boolean }> {
  if (forceMemory || !process.env.DATABASE_URL) {
    const key = slotKey(input.matchId, input.emailType);
    if (memorySlots.has(key)) return { claimed: false };
    memorySlots.add(key);
    return { claimed: true };
  }

  const db = getDb();
  const inserted = await db
    .insert(matchOutboundEmails)
    .values({
      matchId: input.matchId,
      emailType: input.emailType,
    })
    .onConflictDoNothing({
      target: [matchOutboundEmails.matchId, matchOutboundEmails.emailType],
    })
    .returning({
      matchId: matchOutboundEmails.matchId,
      emailType: matchOutboundEmails.emailType,
    });

  return { claimed: inserted.length > 0 };
}

/** Release a claimed slot so a failed send can be retried. */
export async function releaseMatchEmailSlot(input: {
  matchId: string;
  emailType: MatchEmailType | string;
}): Promise<void> {
  if (forceMemory || !process.env.DATABASE_URL) {
    memorySlots.delete(slotKey(input.matchId, input.emailType));
    return;
  }
  const db = getDb();
  await db
    .delete(matchOutboundEmails)
    .where(
      and(
        eq(matchOutboundEmails.matchId, input.matchId),
        eq(matchOutboundEmails.emailType, input.emailType),
      ),
    );
}
