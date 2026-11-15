import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createSenderVerifyToken,
  resetSenderOutboundLimiterForTests,
  verifySenderVerifyToken,
  consumeSenderOutboundSlot,
  SENDER_OUTBOUND_DAILY_LIMIT,
} from './sender-verify.ts';

const env = { AUTH_SECRET: 'sender-verify-test-secret-32chars!!' };

test('sender verify token round-trip within 24h', () => {
  const token = createSenderVerifyToken('Casey@Example.com', { env, now: 1_000 });
  const ok = verifySenderVerifyToken(token, { env, now: 1_000 + 60 });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.email, 'casey@example.com');
});

test('sender verify token expires after 24h', () => {
  const token = createSenderVerifyToken('casey@example.com', {
    env,
    now: 1_000,
    ttlSeconds: 24 * 60 * 60,
  });
  const expired = verifySenderVerifyToken(token, {
    env,
    now: 1_000 + 24 * 60 * 60 + 1,
  });
  assert.equal(expired.ok, false);
});

test('outbound mails to sender capped at 3/day', () => {
  resetSenderOutboundLimiterForTests();
  for (let i = 0; i < SENDER_OUTBOUND_DAILY_LIMIT; i++) {
    assert.equal(consumeSenderOutboundSlot('sender@example.com').ok, true);
  }
  assert.equal(consumeSenderOutboundSlot('sender@example.com').ok, false);
});
