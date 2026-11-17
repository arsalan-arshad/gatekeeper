import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createResendEmailSender, EmailSendError } from './email.ts';
import { maskEmailForLog, parseResendErrorName } from './email-log.ts';

test('maskEmailForLog hides local part', () => {
  assert.equal(maskEmailForLog('jane@example.com'), 'j***@example.com');
});

test('parseResendErrorName reads name from JSON body', () => {
  assert.equal(parseResendErrorName('{"name":"rate_limit_exceeded"}'), 'rate_limit_exceeded');
  assert.equal(parseResendErrorName('not-json'), undefined);
});

test('Resend non-2xx logs masked recipients and throws EmailSendError', async () => {
  const logs: string[] = [];
  const originalError = console.error;
  console.error = (msg: string) => {
    logs.push(String(msg));
  };

  const send = createResendEmailSender({
    apiKey: 're_secret_key_should_not_appear',
    from: 'Gatekeeper <test@example.com>',
    kind: 'intro',
    fetchImpl: async () =>
      new Response(JSON.stringify({ name: 'validation_error' }), { status: 429 }),
  });

  await assert.rejects(
    () =>
      send({
        to: ['alice@example.com', 'bob@example.com'],
        subject: 'Hi',
        text: 'Hi',
        html: '<p>Hi</p>',
        replyTo: ['alice@example.com', 'bob@example.com'],
      }),
    (err: unknown) => err instanceof EmailSendError && err.status === 429,
  );

  console.error = originalError;
  assert.equal(logs.length, 1);
  assert.match(logs[0]!, /status=429/);
  assert.match(logs[0]!, /a\*\*\*@example\.com/);
  assert.doesNotMatch(logs[0]!, /alice@example\.com/);
  assert.doesNotMatch(logs[0]!, /re_secret/);
});

test('Resend payload includes reply_to and never cc/bcc', async () => {
  let body: Record<string, unknown> | null = null;
  const send = createResendEmailSender({
    apiKey: 're_test',
    from: 'Gatekeeper <test@example.com>',
    fetchImpl: async (_url, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ id: 're_1' }), { status: 200 });
    },
  });

  await send({
    to: ['a@example.com', 'b@example.com'],
    subject: 'Intro',
    text: 'x',
    html: '<p>x</p>',
    replyTo: ['a@example.com', 'b@example.com'],
  });

  assert.ok(body);
  assert.deepEqual(body!.reply_to, ['a@example.com', 'b@example.com']);
  assert.equal('cc' in body!, false);
  assert.equal('bcc' in body!, false);
});
