import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEMO_CHIPS,
  DEMO_LEDGER_FALLBACK,
  DEMO_PLACEHOLDERS,
  DEMO_PROFILE_OPTIONS,
} from './demo.ts';

test('demo profiles include @demo indie SaaS', () => {
  const demo = DEMO_PROFILE_OPTIONS.find((p) => p.handle === 'demo');
  assert.ok(demo);
  assert.match(demo!.label, /indie saas/i);
});

test('demo placeholders rotate through accept and spam examples', () => {
  assert.ok(DEMO_PLACEHOLDERS.length >= 3);
  assert.ok(DEMO_PLACEHOLDERS.some((p) => /crypto|nft/i.test(p)));
  assert.ok(DEMO_PLACEHOLDERS.some((p) => /founder|saas|billing/i.test(p)));
});

test('demo chips include spam, weak, and strong one-clicks', () => {
  assert.equal(DEMO_CHIPS.length, 3);
  assert.deepEqual(
    DEMO_CHIPS.map((c) => c.id),
    ['spam', 'weak', 'strong'],
  );
  assert.match(DEMO_CHIPS[0]!.message, /crypto|nft/i);
  assert.match(DEMO_CHIPS[1]!.message, /coffee|pick your brain|quick sync/i);
  assert.match(DEMO_CHIPS[2]!.message, /billing|founder|saas/i);
});

test('demo ledger fallback is labeled user scope for @demo', () => {
  assert.equal(DEMO_LEDGER_FALLBACK.scope, 'user');
  assert.equal(DEMO_LEDGER_FALLBACK.user.handle, 'demo');
  assert.ok(DEMO_LEDGER_FALLBACK.months.length >= 1);
  assert.ok(DEMO_LEDGER_FALLBACK.totals.requestCount > 0);
});
