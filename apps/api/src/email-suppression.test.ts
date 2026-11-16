import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import {
  extractSuppressionFromResendEvent,
  isEmailSuppressed,
  recordEmailSuppression,
  resetEmailSuppressionsForTests,
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

test('verify Resend webhook HMAC signature', () => {
  const secret = 'resend-webhook-test-secret';
  const body = '{"type":"email.bounced"}';
  const sig = createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(verifyResendWebhookSignature(body, sig, secret), true);
  assert.equal(verifyResendWebhookSignature(body, 'deadbeef', secret), false);
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

test('POST /v1/webhooks/resend stores bounce suppression', async () => {
  resetEmailSuppressionsForTests();
  const previous = process.env.RESEND_WEBHOOK_SECRET;
  process.env.RESEND_WEBHOOK_SECRET = 'resend-hook-secret-for-tests';

  const app = await buildServer();
  app.log.level = 'silent';
  try {
    const body = JSON.stringify({
      type: 'email.bounced',
      data: { to: ['hook-bounce@example.com'] },
    });
    const signature = createHmac('sha256', process.env.RESEND_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/resend',
      headers: {
        'content-type': 'application/json',
        'x-resend-signature': signature,
      },
      payload: body,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(await isEmailSuppressed('hook-bounce@example.com'), true);
  } finally {
    await app.close();
    if (previous === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = previous;
  }
});
