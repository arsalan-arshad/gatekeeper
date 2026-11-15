import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decisionFromScore, repairAiVerdict } from './ai-verdict.ts';

test('decisionFromScore maps score bands', () => {
  assert.equal(decisionFromScore(0), 'spam');
  assert.equal(decisionFromScore(25), 'spam');
  assert.equal(decisionFromScore(26), 'reject');
  assert.equal(decisionFromScore(44), 'reject');
  assert.equal(decisionFromScore(59), 'reject');
  assert.equal(decisionFromScore(60), 'accept');
  assert.equal(decisionFromScore(100), 'accept');
});

test('repairAiVerdict restores overwritten accept→reject from score 44', () => {
  const repaired = repairAiVerdict({ decision: 'accept', aiScore: 44 });
  assert.deepEqual(repaired, { decision: 'reject' });
});

test('repairAiVerdict is a no-op when decision already matches score', () => {
  assert.equal(repairAiVerdict({ decision: 'reject', aiScore: 44 }), null);
  assert.equal(repairAiVerdict({ decision: 'spam', aiScore: 10 }), null);
  assert.equal(repairAiVerdict({ decision: 'accept', aiScore: 80 }), null);
  assert.equal(repairAiVerdict({ decision: 'reject', aiScore: null }), null);
});
