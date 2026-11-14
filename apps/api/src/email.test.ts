import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  clearConsoleEmailLog,
  createConsoleEmailSender,
  createEmailSender,
  createResendEmailSender,
  getConsoleEmailLog,
} from './email.ts';

test('createEmailSender uses console mode without RESEND_API_KEY', async () => {
  clearConsoleEmailLog();
  const send = createEmailSender({ EMAIL_FROM: 'Gatekeeper <test@example.com>' });
  const result = await send({
    to: 'a@example.com',
    subject: 'Hello',
    text: 'Hi',
    html: '<p>Hi</p>',
  });
  assert.equal(result.mode, 'console');
  assert.equal(getConsoleEmailLog().length, 1);
});

test('createResendEmailSender posts to Resend API', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ id: 're_123' }), { status: 200 });
  };

  const send = createResendEmailSender({
    apiKey: 're_test',
    from: 'Gatekeeper <test@example.com>',
    fetchImpl,
  });

  const result = await send({
    to: 'a@example.com',
    subject: 'Hello',
    text: 'Hi',
    html: '<p>Hi</p>',
  });

  assert.equal(result.mode, 'resend');
  assert.equal(result.id, 're_123');
  assert.equal(calls[0]?.url, 'https://api.resend.com/emails');
});

test('console sender records outbound mail for tests', async () => {
  clearConsoleEmailLog();
  const send = createConsoleEmailSender();
  await send({ to: 'b@example.com', subject: 'X', text: 'Y', html: '<p>Y</p>' });
  assert.equal(getConsoleEmailLog()[0]?.subject, 'X');
  assert.equal(getConsoleEmailLog()[0]?.to, 'b@example.com');
});
