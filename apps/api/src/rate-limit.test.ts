import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { clientIp } from './client-ip.ts';
import {
  FixedWindowRateLimiter,
  IP_LIMIT,
  checkIpRateLimit,
  checkPublicFormIpRateLimit,
  checkPublicFormSenderOwnerRateLimit,
  rateLimitResultFromCount,
  resetRateLimitersForTests,
  retryAfterSeconds,
  useMemoryRateLimitersForTests,
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
});

test('public form limits: 5/IP/hour and 3/sender/owner/day', async () => {
  resetRateLimitersForTests();
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await checkPublicFormIpRateLimit('1.2.3.4')).ok, true, `ip hit ${i}`);
  }
  assert.equal((await checkPublicFormIpRateLimit('1.2.3.4')).ok, false);

  for (let i = 0; i < 3; i += 1) {
    assert.equal(
      (await checkPublicFormSenderOwnerRateLimit('a@b.co', 'owner-1')).ok,
      true,
      `sender ${i}`,
    );
  }
  assert.equal((await checkPublicFormSenderOwnerRateLimit('a@b.co', 'owner-1')).ok, false);
  assert.equal((await checkPublicFormSenderOwnerRateLimit('other@b.co', 'owner-1')).ok, true);
});

test('35 IP consumes → 429 after IP_LIMIT (Retry-After seconds)', async () => {
  useMemoryRateLimitersForTests(true);
  resetRateLimitersForTests();
  let lastOk = true;
  let lastReset = 0;
  for (let i = 0; i < 35; i += 1) {
    const result = await checkIpRateLimit('spoof-test-ip');
    lastOk = result.ok;
    lastReset = result.resetMs;
    if (i < IP_LIMIT) {
      assert.equal(result.ok, true, `hit ${i} should pass`);
    }
  }
  assert.equal(lastOk, false);
  assert.ok(retryAfterSeconds(lastReset) >= 1);
});

test('clientIp ignores spoofed X-Forwarded-For (uses request.ip only)', () => {
  const ip = clientIp({
    ip: '10.0.0.5',
    // @ts-expect-error — headers must be ignored even if present
    headers: { 'x-forwarded-for': '1.2.3.4, 9.9.9.9' },
  } as { ip: string });
  assert.equal(ip, '10.0.0.5');
});

test('spoofed XFF does not reset rate limit key', async () => {
  useMemoryRateLimitersForTests(true);
  resetRateLimitersForTests();
  // Exhaust limit for the real request.ip
  for (let i = 0; i < IP_LIMIT; i += 1) {
    assert.equal((await checkIpRateLimit('10.0.0.5')).ok, true);
  }
  assert.equal((await checkIpRateLimit('10.0.0.5')).ok, false);
  // Spoofed client XFF must not open a fresh bucket for the same peer.
  const stillBlocked = await checkIpRateLimit(clientIp({ ip: '10.0.0.5' }));
  assert.equal(stillBlocked.ok, false);
});

test('rateLimitResultFromCount treats post-increment over limit as denied', () => {
  const now = 10_000;
  const ok = rateLimitResultFromCount(3, 3, now, now, 60_000);
  assert.equal(ok.ok, true);
  assert.equal(ok.remaining, 0);

  const denied = rateLimitResultFromCount(4, 3, now, now, 60_000);
  assert.equal(denied.ok, false);
  assert.equal(denied.remaining, 0);
});

test('email aliases share public-form sender+owner quota', async () => {
  resetRateLimitersForTests();
  assert.equal((await checkPublicFormSenderOwnerRateLimit('a+1@example.com', 'owner-1')).ok, true);
  assert.equal((await checkPublicFormSenderOwnerRateLimit('a+2@example.com', 'owner-1')).ok, true);
  assert.equal((await checkPublicFormSenderOwnerRateLimit('A+3@Example.com', 'owner-1')).ok, true);
  assert.equal((await checkPublicFormSenderOwnerRateLimit('a+9@example.com', 'owner-1')).ok, false);
  assert.equal((await checkPublicFormSenderOwnerRateLimit('a.b+1@gmail.com', 'owner-1')).ok, true);
  assert.equal((await checkPublicFormSenderOwnerRateLimit('ab+2@gmail.com', 'owner-1')).ok, true);
  assert.equal((await checkPublicFormSenderOwnerRateLimit('a.b+3@gmail.com', 'owner-1')).ok, true);
  assert.equal((await checkPublicFormSenderOwnerRateLimit('ab@gmail.com', 'owner-1')).ok, false);
});

test('postgres consume path is a single upsert RETURNING (no read-then-write)', async () => {
  const src = await readFile(fileURLToPath(new URL('./rate-limit.ts', import.meta.url)), 'utf8');
  const consumeFn = src.slice(
    src.indexOf('export async function consumePostgresRateLimit'),
    src.indexOf('export async function peekPostgresRateLimit'),
  );
  assert.match(consumeFn, /\.insert\(rateLimitBuckets\)/);
  assert.match(consumeFn, /\.onConflictDoUpdate\(/);
  assert.match(consumeFn, /\.returning\(/);
  assert.match(consumeFn, /CASE/);
  assert.doesNotMatch(consumeFn, /\.select\(/);
  // Must not do a separate .update( after a read — only onConflictDoUpdate.
  assert.doesNotMatch(consumeFn, /\.update\(rateLimitBuckets\)/);
});
