import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MAGIC_LINK_SEND_FAILED_MESSAGE,
  maskEmailForLog,
  parseResendErrorName,
  sendMagicLinkViaResend,
} from './magic-link-email.ts';

test('maskEmailForLog keeps first local char and domain', () => {
  assert.equal(maskEmailForLog('jane@example.com'), 'j***@example.com');
  assert.equal(maskEmailForLog('a@x.co'), 'a***@x.co');
  assert.equal(maskEmailForLog('not-an-email'), '***');
});

test('mock Resend 429 → error state; log has status, no token/full email', async () => {
  const logs: string[] = [];
  const magicUrl =
    'http://localhost:3000/api/auth/callback/resend?token=secret-token-value&email=jane%40example.com';

  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ name: 'rate_limit_exceeded', statusCode: 429 }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });

  await assert.rejects(
    () =>
      sendMagicLinkViaResend({
        identifier: 'jane@example.com',
        url: magicUrl,
        apiKey: 're_test_secret_key',
        from: 'Gatekeeper <test@example.com>',
        subject: 'Sign in',
        html: `<a href="${magicUrl}">Sign in</a>`,
        text: `Sign in: ${magicUrl}`,
        fetchImpl,
        log: (message) => logs.push(message),
      }),
    (err: unknown) => err instanceof Error && err.message === MAGIC_LINK_SEND_FAILED_MESSAGE,
  );

  assert.equal(logs.length, 1);
  const line = logs[0]!;
  assert.match(line, /status=429/);
  assert.match(line, /rate_limit_exceeded/);
  assert.match(line, /j\*\*\*@example\.com/);
  assert.doesNotMatch(line, /jane@example\.com/);
  assert.doesNotMatch(line, /secret-token-value/);
  assert.doesNotMatch(line, /re_test_secret_key/);
  assert.doesNotMatch(line, /api\/auth\/callback/);
});

test('parseResendErrorName reads JSON name field', () => {
  assert.equal(parseResendErrorName('{"name":"rate_limit_exceeded"}'), 'rate_limit_exceeded');
  assert.equal(parseResendErrorName('not-json'), undefined);
});

test('Resend 2xx resolves without throwing', async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ id: 're_ok' }), { status: 200 });
  await sendMagicLinkViaResend({
    identifier: 'jane@example.com',
    url: 'http://localhost:3000/api/auth/callback/resend?token=x',
    apiKey: 're_test',
    from: 'Gatekeeper <test@example.com>',
    subject: 'Sign in',
    html: '<p>Hi</p>',
    text: 'Hi',
    fetchImpl,
  });
});
