export type AiOrOwnerDecision = 'accept' | 'reject' | 'spam';

export type InboxFilter = 'all' | 'accepted' | 'rejected' | 'spam';

/**
 * Final inbox status for filters: owner override wins, else AI verdict.
 */
export function finalInboxStatus(row: {
  ownerDecision: AiOrOwnerDecision | null | undefined;
  decision: AiOrOwnerDecision | null | undefined;
}): AiOrOwnerDecision | null {
  return row.ownerDecision ?? row.decision ?? null;
}

export function matchesInboxFilter(
  row: {
    ownerDecision: AiOrOwnerDecision | null | undefined;
    decision: AiOrOwnerDecision | null | undefined;
  },
  filter: InboxFilter,
): boolean {
  if (filter === 'all') return true;
  const final = finalInboxStatus(row);
  if (filter === 'accepted') return final === 'accept';
  if (filter === 'rejected') return final === 'reject';
  if (filter === 'spam') return final === 'spam';
  return true;
}

export function countInboxFilters(
  rows: Array<{
    ownerDecision: AiOrOwnerDecision | null | undefined;
    decision: AiOrOwnerDecision | null | undefined;
  }>,
): { all: number; accepted: number; rejected: number; spam: number; undecided: number } {
  const counts = { all: rows.length, accepted: 0, rejected: 0, spam: 0, undecided: 0 };
  for (const row of rows) {
    const final = finalInboxStatus(row);
    if (final === 'accept') counts.accepted += 1;
    else if (final === 'reject') counts.rejected += 1;
    else if (final === 'spam') counts.spam += 1;
    else counts.undecided += 1;
  }
  return counts;
}
