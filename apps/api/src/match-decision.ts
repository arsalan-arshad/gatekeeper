import { introMatches, matchDismissals } from '@gatekeeper/db';
import { and, eq, gt, isNull } from 'drizzle-orm';

import { getDb } from './db.js';

export type MatchStatusValue = 'pending' | 'accepted' | 'declined' | 'expired' | 'gated';
export type MatchDecisionValue = 'accept' | 'reject' | 'spam';

export type ClaimedMatch = {
  id: string;
  requesterId: string;
  recipientId: string;
  note: string;
  similarity: number;
  aiScore: number | null;
  aiDecision: MatchDecisionValue | null;
  aiReasonPublic: string | null;
  status: MatchStatusValue;
  recipientDecision: MatchDecisionValue | null;
  decidedAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
};

const memoryRows = new Map<string, ClaimedMatch>();
let forceMemory = false;

export function useMemoryMatchDecisionsForTests(enabled = true): void {
  forceMemory = enabled;
  memoryRows.clear();
}

export function seedMemoryMatchForTests(row: ClaimedMatch): void {
  forceMemory = true;
  memoryRows.set(row.id, { ...row });
}

export function getMemoryMatchForTests(id: string): ClaimedMatch | undefined {
  const row = memoryRows.get(id);
  return row ? { ...row } : undefined;
}

export function resetMatchDecisionsForTests(): void {
  forceMemory = true;
  memoryRows.clear();
}

/**
 * Conditional claim modelled on claimOwnerDecision:
 * UPDATE intro_matches SET recipient_decision, status, decided_at
 * WHERE id AND recipient_id AND recipient_decision IS NULL AND status='pending' AND expires_at > now()
 */
export async function claimMatchDecision(input: {
  matchId: string;
  recipientId: string;
  decision: 'accept' | 'reject';
  status: 'accepted' | 'declined';
}): Promise<
  | { claimed: true; row: ClaimedMatch }
  | { claimed: false; reason: 'not_found' | 'already_decided' | 'expired' }
> {
  const decidedAt = new Date();
  const now = decidedAt;

  if (forceMemory || !process.env.DATABASE_URL) {
    const existing = memoryRows.get(input.matchId);
    if (!existing || existing.recipientId !== input.recipientId) {
      return { claimed: false, reason: 'not_found' };
    }
    if (existing.recipientDecision != null || existing.status !== 'pending') {
      return { claimed: false, reason: 'already_decided' };
    }
    if (existing.expiresAt.getTime() <= now.getTime()) {
      // Lazily flip pending → expired so the live pair unique index frees up.
      memoryRows.set(input.matchId, { ...existing, status: 'expired' });
      return { claimed: false, reason: 'expired' };
    }
    const next: ClaimedMatch = {
      ...existing,
      recipientDecision: input.decision,
      status: input.status,
      decidedAt,
    };
    memoryRows.set(input.matchId, next);
    return { claimed: true, row: { ...next } };
  }

  const db = getDb();
  const [row] = await db
    .update(introMatches)
    .set({
      recipientDecision: input.decision,
      status: input.status,
      decidedAt,
    })
    .where(
      and(
        eq(introMatches.id, input.matchId),
        eq(introMatches.recipientId, input.recipientId),
        isNull(introMatches.recipientDecision),
        eq(introMatches.status, 'pending'),
        gt(introMatches.expiresAt, now),
      ),
    )
    .returning();

  if (!row) {
    const [existing] = await db
      .select()
      .from(introMatches)
      .where(eq(introMatches.id, input.matchId))
      .limit(1);
    if (!existing || existing.recipientId !== input.recipientId) {
      return { claimed: false, reason: 'not_found' };
    }
    if (existing.expiresAt.getTime() <= now.getTime() && existing.status === 'pending') {
      // Lazily flip so intro_matches_pair_live no longer blocks a new request.
      await db
        .update(introMatches)
        .set({ status: 'expired' })
        .where(
          and(
            eq(introMatches.id, input.matchId),
            eq(introMatches.status, 'pending'),
            isNull(introMatches.recipientDecision),
          ),
        );
      return { claimed: false, reason: 'expired' };
    }
    return { claimed: false, reason: 'already_decided' };
  }

  return {
    claimed: true,
    row: {
      id: row.id,
      requesterId: row.requesterId,
      recipientId: row.recipientId,
      note: row.note,
      similarity: row.similarity,
      aiScore: row.aiScore,
      aiDecision: row.aiDecision,
      aiReasonPublic: row.aiReasonPublic,
      status: row.status,
      recipientDecision: row.recipientDecision,
      decidedAt: row.decidedAt,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    },
  };
}

/** Write dismissals both ways on decline (silent). */
export async function writeMatchDismissalsBothWays(input: {
  userA: string;
  userB: string;
}): Promise<void> {
  if (forceMemory || !process.env.DATABASE_URL) {
    return;
  }
  const db = getDb();
  await db
    .insert(matchDismissals)
    .values([
      { userId: input.userA, dismissedUserId: input.userB },
      { userId: input.userB, dismissedUserId: input.userA },
    ])
    .onConflictDoNothing();
}
