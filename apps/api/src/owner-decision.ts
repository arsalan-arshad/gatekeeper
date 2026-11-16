import { requests } from '@gatekeeper/db';
import { and, eq, isNull } from 'drizzle-orm';

import { getDb } from './db.js';

export type OwnerDecisionValue = 'accept' | 'reject' | 'spam';

export type RequestStatusValue = 'pending' | 'delivered' | 'accepted' | 'declined';

export type ClaimedRequest = typeof requests.$inferSelect;

type MemoryRow = ClaimedRequest;

/** In-memory rows for unit tests (simulates conditional UPDATE … WHERE owner_decision IS NULL). */
const memoryRows = new Map<string, MemoryRow>();
let forceMemory = false;

export function useMemoryOwnerDecisionsForTests(enabled = true): void {
  forceMemory = enabled;
  memoryRows.clear();
}

export function seedMemoryRequestForTests(row: MemoryRow): void {
  forceMemory = true;
  memoryRows.set(row.id, { ...row });
}

export function getMemoryRequestForTests(id: string): MemoryRow | undefined {
  const row = memoryRows.get(id);
  return row ? { ...row } : undefined;
}

export function resetOwnerDecisionsForTests(): void {
  forceMemory = true;
  memoryRows.clear();
}

/**
 * Single conditional claim: only the first concurrent actor wins.
 * UPDATE … SET owner_decision=…, decided_at=now()
 * WHERE id=$1 AND target_user_id=$2 AND owner_decision IS NULL
 * RETURNING *
 */
export async function claimOwnerDecision(input: {
  requestId: string;
  ownerId: string;
  ownerDecision: OwnerDecisionValue;
  status: RequestStatusValue;
  stakeCents?: number;
}): Promise<{ claimed: true; row: ClaimedRequest } | { claimed: false }> {
  const decidedAt = new Date();

  if (forceMemory || !process.env.DATABASE_URL) {
    const existing = memoryRows.get(input.requestId);
    if (!existing || existing.targetUserId !== input.ownerId) {
      return { claimed: false };
    }
    if (existing.ownerDecision != null) {
      return { claimed: false };
    }
    const next: MemoryRow = {
      ...existing,
      ownerDecision: input.ownerDecision,
      decidedAt,
      status: input.status,
      stakeCents: input.stakeCents ?? existing.stakeCents,
    };
    memoryRows.set(input.requestId, next);
    return { claimed: true, row: { ...next } };
  }

  const db = getDb();
  const patch: {
    ownerDecision: OwnerDecisionValue;
    decidedAt: Date;
    status: RequestStatusValue;
    stakeCents?: number;
  } = {
    ownerDecision: input.ownerDecision,
    decidedAt,
    status: input.status,
  };
  if (input.stakeCents !== undefined) {
    patch.stakeCents = input.stakeCents;
  }

  const [row] = await db
    .update(requests)
    .set(patch)
    .where(
      and(
        eq(requests.id, input.requestId),
        eq(requests.targetUserId, input.ownerId),
        isNull(requests.ownerDecision),
      ),
    )
    .returning();

  if (!row) return { claimed: false };
  return { claimed: true, row };
}

/** Finalize stake/status after side-effects (email, settlement) — does not re-check owner_decision. */
export async function finalizeOwnerDecision(input: {
  requestId: string;
  ownerId: string;
  status: RequestStatusValue;
  stakeCents: number;
}): Promise<void> {
  if (forceMemory || !process.env.DATABASE_URL) {
    const existing = memoryRows.get(input.requestId);
    if (!existing || existing.targetUserId !== input.ownerId) return;
    memoryRows.set(input.requestId, {
      ...existing,
      status: input.status,
      stakeCents: input.stakeCents,
    });
    return;
  }

  const db = getDb();
  await db
    .update(requests)
    .set({ status: input.status, stakeCents: input.stakeCents })
    .where(and(eq(requests.id, input.requestId), eq(requests.targetUserId, input.ownerId)));
}
