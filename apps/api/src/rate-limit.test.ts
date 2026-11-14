import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FixedWindowRateLimiter } from './rate-limit.ts';

test('FixedWindowRateLimiter enforces the limit inside a window', () => {
  let now = 1_000;
  const limiter = new FixedWindowRateLimiter(2, 1_000, () => now);

  assert.equal(limiter.check('a').ok, true);
  assert.equal(limiter.check('a').ok, true);
  assert.equal(limiter.check('a').ok, false);

  now = 2_100;
  assert.equal(limiter.check('a').ok, true);
});

test('different keys have independent budgets', () => {
  const limiter = new FixedWindowRateLimiter(1, 60_000);
  assert.equal(limiter.check('one').ok, true);
  assert.equal(limiter.check('one').ok, false);
  assert.equal(limiter.check('two').ok, true);
});
