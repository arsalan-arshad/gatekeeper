import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clearConsoleEmailLog, createConsoleEmailSender } from './email.ts';
import { buildSenderVerifyEmail } from './email-templates.ts';
import { resetEmailSuppressionsForTests } from './email-suppression.ts';
import {
  createSenderVerifyToken,
  resetSenderOutboundLimiterForTests,
  verifySenderVerifyToken,
  consumeSenderOutboundSlot,
  maybeSendSenderVerificationEmail,
  setSenderVerifiedForTests,
  SENDER_OUTBOUND_DAILY_LIMIT,
  SENDER_VERIFY_EMAIL_LIMIT,
  SENDER_VERIFY_GLOBAL_LIMIT,
  SENDER_VERIFY_IP_LIMIT,
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

test('outbound mails to sender capped at 3/day', async () => {
  resetSenderOutboundLimiterForTests();
  for (let i = 0; i < SENDER_OUTBOUND_DAILY_LIMIT; i++) {
    assert.equal((await consumeSenderOutboundSlot('sender@example.com')).ok, true);
  }
  assert.equal((await consumeSenderOutboundSlot('sender@example.com')).ok, false);
});

test('sender verification emails capped at 1/address/day, per owner, 20/IP/day, global 200', async () => {
  resetSenderOutboundLimiterForTests();
  resetEmailSuppressionsForTests();
  setSenderVerifiedForTests(null);
  clearConsoleEmailLog();
  const send = createConsoleEmailSender();

  assert.equal(SENDER_VERIFY_EMAIL_LIMIT, 1);
  assert.equal(SENDER_VERIFY_IP_LIMIT, 20);
  assert.equal(SENDER_VERIFY_GLOBAL_LIMIT, 200);

  const first = await maybeSendSenderVerificationEmail(send, {
    senderEmail: 'verify-cap@example.com',
    senderName: 'Casey',
    ownerId: 'owner-a',
    clientIp: '203.0.113.10',
    env: { ...env, API_URL: 'http://localhost:4000' },
  });
  assert.equal(first.sent, true);

  const second = await maybeSendSenderVerificationEmail(send, {
    senderEmail: 'verify-cap@example.com',
    senderName: 'Casey',
    ownerId: 'owner-b',
    clientIp: '203.0.113.11',
    env: { ...env, API_URL: 'http://localhost:4000' },
  });
  assert.equal(second.sent, false);
  assert.equal(second.reason, 'verify_email_cap');

  // Same address already burned; distinct address + same owner still allowed once.
  const ownerScoped = await maybeSendSenderVerificationEmail(send, {
    senderEmail: 'verify-owner-scoped@example.com',
    senderName: 'Casey',
    ownerId: 'owner-a',
    clientIp: '203.0.113.99',
    env: { ...env, API_URL: 'http://localhost:4000' },
  });
  assert.equal(ownerScoped.sent, true);

  const ownerAgain = await maybeSendSenderVerificationEmail(send, {
    senderEmail: 'verify-owner-scoped@example.com',
    senderName: 'Casey',
    ownerId: 'owner-a',
    clientIp: '203.0.113.98',
    env: { ...env, API_URL: 'http://localhost:4000' },
  });
  assert.equal(ownerAgain.sent, false);
  assert.ok(
    ownerAgain.reason === 'verify_email_cap' || ownerAgain.reason === 'verify_owner_email_cap',
  );

  // Exhaust IP quota across distinct addresses (1/email already proven).
  for (let i = 0; i < SENDER_VERIFY_IP_LIMIT - 1; i += 1) {
    const result = await maybeSendSenderVerificationEmail(send, {
      senderEmail: `verify-ip-${i}@example.com`,
      senderName: 'Casey',
      ownerId: `owner-ip-${i}`,
      clientIp: '203.0.113.10',
      env: { ...env, API_URL: 'http://localhost:4000' },
    });
    assert.equal(result.sent, true, `ip send ${i}`);
  }
  const ipBlocked = await maybeSendSenderVerificationEmail(send, {
    senderEmail: 'verify-ip-blocked@example.com',
    senderName: 'Casey',
    ownerId: 'owner-ip-blocked',
    clientIp: '203.0.113.10',
    env: { ...env, API_URL: 'http://localhost:4000' },
  });
  assert.equal(ipBlocked.sent, false);
  assert.equal(ipBlocked.reason, 'verify_ip_cap');
});

test('sender verify email includes ignore-if-unrequested copy', () => {
  const email = buildSenderVerifyEmail({
    senderName: 'Casey',
    verifyUrl: 'https://api.example/v1/senders/verify?token=abc',
    env: { APP_URL: 'https://app.example' },
  });
  assert.match(email.text, /didn't request this/i);
  assert.match(email.html, /didn(?:'|&apos;)t request this/i);
});
