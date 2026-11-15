import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  FixedWindowRateLimiter,
  checkPublicFormIpRateLimit,
  checkPublicFormSenderOwnerRateLimit,
  resetRateLimitersForTests,
} from './rate-limit.ts';

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

test('peek reports remaining without consuming quota', () => {
  const now = 1_000;
  const limiter = new FixedWindowRateLimiter(3, 1_000, () => now);

  assert.equal(limiter.peek('a').remaining, 3);
  assert.equal(limiter.check('a').remaining, 2);
  assert.equal(limiter.peek('a').remaining, 2);
  assert.equal(limiter.check('a').remaining, 1);
  assert.equal(limiter.peek('a').remaining, 1);
});

test('public form limits: 5/IP/hour and 3/sender/owner/day', () => {
  resetRateLimitersForTests();
  for (let i = 0; i < 5; i += 1) {
    assert.equal(checkPublicFormIpRateLimit('1.2.3.4').ok, true, `ip hit ${i}`);
  }
  assert.equal(checkPublicFormIpRateLimit('1.2.3.4').ok, false);

  for (let i = 0; i < 3; i += 1) {
    assert.equal(checkPublicFormSenderOwnerRateLimit('a@b.co', 'owner-1').ok, true, `sender ${i}`);
  }
  assert.equal(checkPublicFormSenderOwnerRateLimit('a@b.co', 'owner-1').ok, false);
  assert.equal(checkPublicFormSenderOwnerRateLimit('other@b.co', 'owner-1').ok, true);
});
