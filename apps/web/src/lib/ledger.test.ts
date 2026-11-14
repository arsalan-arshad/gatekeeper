import assert from 'node:assert/strict';
import { test } from 'node:test';

import { emptyGlobalLedger, formatPercent } from './ledger.ts';

test('emptyGlobalLedger is a public zeroed payload', () => {
  const payload = emptyGlobalLedger();
  assert.equal(payload.scope, 'global');
  assert.equal(payload.totals.requestCount, 0);
  assert.equal(payload.totals.trustScore, null);
  assert.deepEqual(payload.months, []);
});

test('formatPercent handles null', () => {
  assert.equal(formatPercent(null), '—');
  assert.equal(formatPercent(0.5), '50%');
});
