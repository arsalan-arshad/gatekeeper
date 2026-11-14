import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clearConsoleEmailLog, createConsoleEmailSender, getConsoleEmailLog } from './email.ts';
import {
  buildOptInLinks,
  sendIntroEmailToBoth,
  sendReceiverOptInEmail,
  sendRejectEmailToSender,
  statusAfterJudgment,
} from './opt-in.ts';

test('statusAfterJudgment marks AI accepts as delivered', () => {
  assert.equal(statusAfterJudgment('accept'), 'delivered');
  assert.equal(statusAfterJudgment('reject'), 'pending');
  assert.equal(statusAfterJudgment('spam'), 'pending');
});

test('buildOptInLinks includes signed accept and decline URLs', () => {
  const links = buildOptInLinks('11111111-1111-1111-1111-111111111111', {
    API_URL: 'http://localhost:4000',
    AUTH_SECRET: 'test-secret',
  });
  assert.match(links.acceptUrl, /action=accept/);
  assert.match(links.declineUrl, /action=decline/);
  assert.match(links.acceptUrl, /token=/);
});

test('receiver opt-in email contains Accept/Decline links and summary', async () => {
  clearConsoleEmailLog();
  const send = createConsoleEmailSender();
  await sendReceiverOptInEmail(send, {
    receiverEmail: 'ada@example.com',
    receiverName: 'Ada',
    senderName: 'Maya',
    senderType: 'human',
    message: 'Would love to compare billing notes.',
    score: 88,
    requestId: '22222222-2222-2222-2222-222222222222',
    env: { API_URL: 'http://localhost:4000', AUTH_SECRET: 'test-secret' },
  });

  const [email] = getConsoleEmailLog();
  assert.ok(email);
  assert.equal(email.to, 'ada@example.com');
  assert.match(email.text, /Accept:/);
  assert.match(email.text, /Decline:/);
  assert.match(email.text, /88\/100/);
  assert.match(email.text, /billing notes/);
});

test('reject email includes reason_public and suggested_rewrite only', async () => {
  clearConsoleEmailLog();
  const send = createConsoleEmailSender();
  await sendRejectEmailToSender(send, {
    senderEmail: 'maya@example.com',
    senderName: 'Maya',
    receiverName: 'Ada',
    judgment: {
      decision: 'reject',
      reason_public: 'Generic agency outreach without a specific connection.',
      suggested_rewrite: 'Share mutual context and one concrete ask.',
    },
  });

  const [email] = getConsoleEmailLog();
  assert.ok(email);
  assert.equal(email.to, 'maya@example.com');
  assert.match(email.text, /Generic agency outreach/);
  assert.match(email.text, /Suggested rewrite/);
  assert.doesNotMatch(email.text, /gate_rules|Deal-breakers:/i);
});

test('intro email goes to both parties after receiver accept', async () => {
  clearConsoleEmailLog();
  const send = createConsoleEmailSender();
  await sendIntroEmailToBoth(send, {
    receiverEmail: 'ada@example.com',
    receiverName: 'Ada',
    senderEmail: 'maya@example.com',
    senderName: 'Maya',
    message: 'Let’s swap billing notes.',
    requestId: '33333333-3333-3333-3333-333333333333',
    env: { API_URL: 'http://localhost:4000', AUTH_SECRET: 'test-secret' },
  });

  const [email] = getConsoleEmailLog();
  assert.ok(email);
  assert.deepEqual(email.to, ['ada@example.com', 'maya@example.com']);
  assert.match(email.text, /You're connected via Gatekeeper/);
  assert.match(email.text, /billing notes/);
  assert.match(email.text, /was this intro helpful/i);
  assert.match(email.text, /helpful=true/);
  assert.match(email.text, /helpful=false/);
});
