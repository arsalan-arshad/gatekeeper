import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveIntroContactEmail } from './contact-email.ts';
import {
  clearConsoleEmailLog,
  createConsoleEmailSender,
  createResendEmailSender,
  getConsoleEmailLog,
  setEmailSenderForTests,
} from './email.ts';
import { buildServer } from './index.ts';
import {
  countOutboundEmailsForTests,
  OUTBOUND_EMAIL_TYPES,
  resetOutboundEmailsForTests,
  claimOutboundEmailSlot,
  useMemoryOutboundEmailsForTests,
} from './outbound-email.ts';
import {
  getMemoryRequestForTests,
  resetOwnerDecisionsForTests,
  seedMemoryRequestForTests,
} from './owner-decision.ts';
import {
  resetMemoryOptInRespondForTests,
  seedMemoryOptInRespondForTests,
} from './routes/opt-in.ts';
import { resetSenderOutboundLimiterForTests, setSenderVerifiedForTests } from './sender-verify.ts';
import { createOptInToken } from './tokens.ts';

const SECRET = 'opt-in-respond-test-secret-32chars!!';
const REQUEST_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OWNER_ID = '11111111-2222-3333-4444-555555555555';

function seedDeliveredRequest() {
  const request = {
    id: REQUEST_ID,
    senderType: 'human' as const,
    senderName: 'Maya',
    senderContact: 'maya@example.com',
    apiKeyId: null,
    targetUserId: OWNER_ID,
    message: 'Peer founder intro about billing workflows.',
    aiScore: 88,
    aiReason: 'fit',
    aiReasonPublic: 'Strong peer fit',
    decision: 'accept' as const,
    ownerDecision: null,
    decidedAt: null,
    status: 'delivered' as const,
    stakeCents: 0,
    helpful: null,
    createdAt: new Date(),
  };
  seedMemoryRequestForTests(request);
  return request;
}

test('email-link accept: EmailSendError → 200 failure copy, accepted, slot released, masked log', async () => {
  const previousAuth = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = SECRET;

  useMemoryOutboundEmailsForTests(true);
  resetOutboundEmailsForTests();
  resetOwnerDecisionsForTests();
  resetSenderOutboundLimiterForTests();
  setSenderVerifiedForTests('maya@example.com');
  clearConsoleEmailLog();
  resetMemoryOptInRespondForTests();

  const request = seedDeliveredRequest();
  seedMemoryOptInRespondForTests({
    request,
    receiver: {
      id: OWNER_ID,
      email: 'ada@example.com',
      name: 'Ada',
      introContactEmail: null,
      introContactVerifiedAt: null,
    },
  });

  const logs: string[] = [];
  const originalError = console.error;
  console.error = (msg: string) => {
    logs.push(String(msg));
  };

  setEmailSenderForTests(
    createResendEmailSender({
      apiKey: 're_secret_key_must_not_appear_in_logs',
      from: 'Gatekeeper <test@example.com>',
      kind: 'intro',
      fetchImpl: async () =>
        new Response(JSON.stringify({ name: 'server_error' }), { status: 500 }),
    }),
  );

  const token = createOptInToken({ requestId: REQUEST_ID, action: 'accept' });
  const app = await buildServer();
  app.log.level = 'silent';

  const res = await app.inject({
    method: 'GET',
    url: `/v1/requests/${REQUEST_ID}/respond?action=accept&token=${encodeURIComponent(token)}`,
  });

  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'] ?? '', /text\/html/);
  assert.match(res.body, /couldn't send the intro email right now/i);
  assert.match(res.body, /Resend intro email/);
  assert.doesNotMatch(res.body, /<title>Intro sent<\/title>/);

  const row = getMemoryRequestForTests(REQUEST_ID);
  assert.equal(row?.status, 'accepted');
  assert.equal(row?.ownerDecision, 'accept');
  assert.equal(countOutboundEmailsForTests(OUTBOUND_EMAIL_TYPES.introConnected), 0);

  assert.ok(logs.length >= 1);
  const joined = logs.join('\n');
  assert.match(joined, /status=500/);
  assert.doesNotMatch(joined, /ada@example\.com/);
  assert.doesNotMatch(joined, /maya@example\.com/);
  assert.doesNotMatch(joined, /re_secret/);
  assert.equal(joined.includes(token), false);

  console.error = originalError;
  setEmailSenderForTests(null);
  setSenderVerifiedForTests(null);
  resetMemoryOptInRespondForTests();
  await app.close();
  if (previousAuth === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = previousAuth;
});

test('email-link accept: skipped slot → already-sent copy', async () => {
  const previousAuth = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = SECRET;

  useMemoryOutboundEmailsForTests(true);
  resetOutboundEmailsForTests();
  resetOwnerDecisionsForTests();
  resetSenderOutboundLimiterForTests();
  setSenderVerifiedForTests('maya@example.com');
  clearConsoleEmailLog();
  resetMemoryOptInRespondForTests();

  const request = seedDeliveredRequest();
  seedMemoryOptInRespondForTests({
    request,
    receiver: {
      id: OWNER_ID,
      email: 'ada@example.com',
      name: 'Ada',
    },
  });

  await claimOutboundEmailSlot({
    requestId: REQUEST_ID,
    emailType: OUTBOUND_EMAIL_TYPES.introConnected,
  });

  setEmailSenderForTests(createConsoleEmailSender());

  const token = createOptInToken({ requestId: REQUEST_ID, action: 'accept' });
  const app = await buildServer();
  app.log.level = 'silent';

  const res = await app.inject({
    method: 'GET',
    url: `/v1/requests/${REQUEST_ID}/respond?action=accept&token=${encodeURIComponent(token)}`,
  });

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /Accepted\. The intro email was already sent\./);
  assert.doesNotMatch(res.body, /<title>Intro sent<\/title>/);
  assert.equal(getConsoleEmailLog().length, 0);

  setEmailSenderForTests(null);
  setSenderVerifiedForTests(null);
  resetMemoryOptInRespondForTests();
  await app.close();
  if (previousAuth === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = previousAuth;
});

test('email-link accept uses verified intro_contact_email as receiver address', async () => {
  const previousAuth = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = SECRET;

  useMemoryOutboundEmailsForTests(true);
  resetOutboundEmailsForTests();
  resetOwnerDecisionsForTests();
  resetSenderOutboundLimiterForTests();
  setSenderVerifiedForTests('maya@example.com');
  clearConsoleEmailLog();
  resetMemoryOptInRespondForTests();

  const receiver = {
    id: OWNER_ID,
    email: 'ada@example.com',
    name: 'Ada',
    introContactEmail: 'ada-work@example.com',
    introContactVerifiedAt: new Date(),
  };
  assert.equal(resolveIntroContactEmail(receiver), 'ada-work@example.com');

  const request = seedDeliveredRequest();
  seedMemoryOptInRespondForTests({ request, receiver });
  setEmailSenderForTests(createConsoleEmailSender());

  const token = createOptInToken({ requestId: REQUEST_ID, action: 'accept' });
  const app = await buildServer();
  app.log.level = 'silent';

  const res = await app.inject({
    method: 'GET',
    url: `/v1/requests/${REQUEST_ID}/respond?action=accept&token=${encodeURIComponent(token)}`,
  });

  assert.equal(res.statusCode, 200);
  assert.match(res.body, /<title>Intro sent<\/title>/);

  const [email] = getConsoleEmailLog();
  assert.ok(email);
  const recipients = Array.isArray(email.to) ? email.to : [email.to];
  assert.ok(recipients.includes('ada-work@example.com'));
  assert.equal(recipients.includes('ada@example.com'), false);

  setEmailSenderForTests(null);
  setSenderVerifiedForTests(null);
  resetMemoryOptInRespondForTests();
  await app.close();
  if (previousAuth === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = previousAuth;
});
