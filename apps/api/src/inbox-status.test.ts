import assert from 'node:assert/strict';
import { test } from 'node:test';

import { countInboxFilters, finalInboxStatus, matchesInboxFilter } from './inbox-status.ts';

test('finalInboxStatus prefers owner_decision over ai verdict', () => {
  assert.equal(finalInboxStatus({ ownerDecision: 'accept', decision: 'reject' }), 'accept');
  assert.equal(finalInboxStatus({ ownerDecision: null, decision: 'spam' }), 'spam');
  assert.equal(finalInboxStatus({ ownerDecision: undefined, decision: null }), null);
});

test('inbox filter counts sum to All (including undecided)', () => {
  const rows = [
    { ownerDecision: 'accept' as const, decision: 'reject' as const },
    { ownerDecision: null, decision: 'accept' as const },
    { ownerDecision: 'reject' as const, decision: 'accept' as const },
    { ownerDecision: null, decision: 'spam' as const },
    { ownerDecision: 'spam' as const, decision: 'reject' as const },
    { ownerDecision: null, decision: null },
  ];
  const counts = countInboxFilters(rows);
  assert.equal(counts.all, 6);
  assert.equal(counts.accepted + counts.rejected + counts.spam + counts.undecided, counts.all);
  assert.equal(counts.accepted, 2);
  assert.equal(counts.rejected, 1);
  assert.equal(counts.spam, 2);
  assert.equal(counts.undecided, 1);

  assert.equal(rows.filter((r) => matchesInboxFilter(r, 'accepted')).length, counts.accepted);
  assert.equal(rows.filter((r) => matchesInboxFilter(r, 'rejected')).length, counts.rejected);
  assert.equal(rows.filter((r) => matchesInboxFilter(r, 'spam')).length, counts.spam);
});
