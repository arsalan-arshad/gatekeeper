import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEMO_LEDGER_FALLBACK, DEMO_PLACEHOLDERS, DEMO_PROFILE_OPTIONS } from './demo.ts';

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

test('demo ledger fallback is labeled user scope for @demo', () => {
  assert.equal(DEMO_LEDGER_FALLBACK.scope, 'user');
  assert.equal(DEMO_LEDGER_FALLBACK.user.handle, 'demo');
  assert.ok(DEMO_LEDGER_FALLBACK.months.length >= 1);
});
