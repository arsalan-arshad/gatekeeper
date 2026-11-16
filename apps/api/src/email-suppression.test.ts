import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import {
  decodeResendWebhookSecret,
  extractSuppressionFromResendEvent,
  isEmailSuppressed,
  recordEmailSuppression,
  resetEmailSuppressionsForTests,
  RESEND_WEBHOOK_TOLERANCE_SEC,
  verifyResendWebhookSignature,
} from './email-suppression.ts';
import { clearConsoleEmailLog, createConsoleEmailSender } from './email.ts';
import { resetRateLimitersForTests } from './rate-limit.ts';
import {
  maybeSendSenderVerificationEmail,
  resetSenderOutboundLimiterForTests,
  setSenderVerifiedForTests,
} from './sender-verify.ts';
import { buildServer } from './index.ts';

/** Test secret — base64 of "resend-webhook-test-secret!!" with whsec_ prefix. */
const TEST_WEBHOOK_SECRET = `whsec_${Buffer.from('resend-webhook-test-secret!!').toString('base64')}`;

function signSvix(
  body: string,
  id: string,
  timestamp: string,
  secret = TEST_WEBHOOK_SECRET,
): string {
  const key = decodeResendWebhookSecret(secret);
  const digest = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
  return `v1,${digest}`;
}

test('Resend bounce/complaint events extract suppression targets', () => {
  assert.deepEqual(
    extractSuppressionFromResendEvent({
      type: 'email.bounced',
      data: { to: ['bounce@example.com'] },
    }),
    { email: 'bounce@example.com', reason: 'bounce' },
  );
  assert.deepEqual(
    extractSuppressionFromResendEvent({
      type: 'email.complained',
      data: { to: 'complaint@example.com' },
    }),
    { email: 'complaint@example.com', reason: 'complaint' },
  );
  assert.equal(
    extractSuppressionFromResendEvent({
      type: 'email.delivered',
      data: { to: ['ok@example.com'] },
    }),
    null,
  );
});

test('verify Resend Svix signature (id + timestamp + raw body)', () => {
  const body = '{"type":"email.bounced"}';
  const id = 'msg_test_1';
  const timestamp = '1700000000';
  const sig = signSvix(body, id, timestamp);
  assert.equal(
    verifyResendWebhookSignature(
      body,
      { id, timestamp, signature: sig },
      TEST_WEBHOOK_SECRET,
      1700000000,
    ),
    true,
  );
  assert.equal(
    verifyResendWebhookSignature(
      body,
      { id, timestamp, signature: 'v1,deadbeef' },
      TEST_WEBHOOK_SECRET,
      1700000000,
    ),
    false,
  );
  assert.equal(
    verifyResendWebhookSignature(
      body,
      { id, timestamp, signature: sig },
      TEST_WEBHOOK_SECRET,
      1700000000 + RESEND_WEBHOOK_TOLERANCE_SEC + 1,
    ),
    false,
  );
});

test('sender verify skips bounce/complaint suppression list', async () => {
  resetEmailSuppressionsForTests();
  resetSenderOutboundLimiterForTests();
  resetRateLimitersForTests();
  setSenderVerifiedForTests(null);
  clearConsoleEmailLog();

  await recordEmailSuppression({ email: 'suppressed@example.com', reason: 'bounce' });
  assert.equal(await isEmailSuppressed('Suppressed@Example.com'), true);

  const send = createConsoleEmailSender();
  const result = await maybeSendSenderVerificationEmail(send, {
    senderEmail: 'suppressed@example.com',
    senderName: 'Casey',
    ownerId: 'owner-1',
    clientIp: '203.0.113.50',
    env: { AUTH_SECRET: 'sender-verify-test-secret-32chars!!', API_URL: 'http://localhost:4000' },
  });
  assert.equal(result.sent, false);
  assert.equal(result.reason, 'suppressed');
});

test('POST /v1/webhooks/resend without secret returns 204 and ignores', async () => {
  const previous = process.env.RESEND_WEBHOOK_SECRET;
  delete process.env.RESEND_WEBHOOK_SECRET;

  const app = await buildServer();
  app.log.level = 'silent';
  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/resend',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({
        type: 'email.bounced',
        data: { to: ['ignored@example.com'] },
      }),
    });
    assert.equal(response.statusCode, 204);
    assert.equal(await isEmailSuppressed('ignored@example.com'), false);
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = previous;
  }
});

test('POST /v1/webhooks/resend stores bounce suppression with Svix headers', async () => {
  resetEmailSuppressionsForTests();
  const previous = process.env.RESEND_WEBHOOK_SECRET;
  process.env.RESEND_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

  const app = await buildServer();
  app.log.level = 'silent';
  try {
    const body = JSON.stringify({
      type: 'email.bounced',
      data: { to: ['hook-bounce@example.com'] },
    });
    const id = 'msg_hook_bounce';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signSvix(body, id, timestamp);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/resend',
      headers: {
        'content-type': 'application/json',
        'svix-id': id,
        'svix-timestamp': timestamp,
        'svix-signature': signature,
      },
      payload: body,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(await isEmailSuppressed('hook-bounce@example.com'), true);

    const bad = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/resend',
      headers: {
        'content-type': 'application/json',
        'svix-id': id,
        'svix-timestamp': timestamp,
        'svix-signature': 'v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      },
      payload: body,
    });
    assert.equal(bad.statusCode, 401);
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = previous;
  }
});
