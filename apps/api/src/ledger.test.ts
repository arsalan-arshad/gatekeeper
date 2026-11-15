import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  computeAcceptRate,
  computeTrustScore,
  isDemoLedgerHandle,
  summarizeLedgerMonths,
} from './ledger.ts';
import { createHelpfulToken, verifyHelpfulToken } from './tokens.ts';

test('computeTrustScore is helpful / delivered', () => {
  assert.equal(computeTrustScore(0, 0), null);
  assert.equal(computeTrustScore(3, 4), 0.75);
  assert.equal(computeTrustScore(0, 5), 0);
});

test('computeAcceptRate is accepted / total_requests (0 if total=0)', () => {
  // Spec: total/delivered/accepted → rate
  // 20 requests, 10 delivered, 8 accepted → 40%
  assert.equal(computeAcceptRate(8, 20), 0.4);
  // 4 requests, 2 delivered, 3 accepted → 75%
  assert.equal(computeAcceptRate(3, 4), 0.75);
  assert.equal(computeAcceptRate(0, 0), 0);
  assert.equal(computeAcceptRate(5, 0), 0);
});

test('isDemoLedgerHandle matches seeded demo profiles', () => {
  assert.equal(isDemoLedgerHandle('demo'), true);
  assert.equal(isDemoLedgerHandle('ADA'), true);
  assert.equal(isDemoLedgerHandle('real-user'), false);
  assert.equal(isDemoLedgerHandle(null), false);
});

test('summarizeLedgerMonths aggregates months and trust', () => {
  const summary = summarizeLedgerMonths([
    {
      month: '2026-10',
      requestCount: 10,
      deliveredCount: 4,
      acceptedCount: 2,
      spamCount: 3,
      helpfulCount: 1,
      acceptRate: 0.4,
    },
    {
      month: '2026-11',
      requestCount: 5,
      deliveredCount: 2,
      acceptedCount: 1,
      spamCount: 1,
      helpfulCount: 1,
      acceptRate: 0.4,
    },
  ]);

  assert.equal(summary.requestCount, 15);
  assert.equal(summary.deliveredCount, 6);
  assert.equal(summary.acceptedCount, 3);
  assert.equal(summary.spamCount, 4);
  assert.equal(summary.helpfulCount, 2);
  // accepted / total_requests = 3/15
  assert.equal(summary.acceptRate, 0.2);
  assert.equal(summary.trustScore, Number((2 / 6).toFixed(4)));
});

test('helpful tokens verify for yes/no ratings', () => {
  const env = { AUTH_SECRET: 'ledger-test-secret' };
  const yes = createHelpfulToken({ requestId: 'r1', helpful: true }, { env });
  const no = createHelpfulToken({ requestId: 'r1', helpful: false }, { env });

  assert.equal(verifyHelpfulToken(yes, { requestId: 'r1', helpful: true }, { env }).ok, true);
  assert.equal(verifyHelpfulToken(yes, { requestId: 'r1', helpful: false }, { env }).ok, false);
  assert.equal(verifyHelpfulToken(no, { requestId: 'r1', helpful: false }, { env }).ok, true);
});
