import assert from 'node:assert/strict';
import { test } from 'node:test';

import { approveInboxRequest, ALREADY_DECIDED_ERROR } from './approve-request.ts';
import { clearConsoleEmailLog, createConsoleEmailSender, getConsoleEmailLog } from './email.ts';
import {
  countOutboundEmailsForTests,
  OUTBOUND_EMAIL_TYPES,
  resetOutboundEmailsForTests,
} from './outbound-email.ts';
import { resetOwnerDecisionsForTests, seedMemoryRequestForTests } from './owner-decision.ts';
import { resetSenderOutboundLimiterForTests, setSenderVerifiedForTests } from './sender-verify.ts';

const REQUEST_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const OWNER_ID = '11111111-2222-3333-4444-555555555555';

test('CONCUR-01: 5 parallel approves → 1 intro email row, 4× 409 Already decided', async () => {
  const previousSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = 'approve-idempotency-test-secret-32ch!!';

  resetOwnerDecisionsForTests();
  resetOutboundEmailsForTests();
  resetSenderOutboundLimiterForTests();
  setSenderVerifiedForTests('maya@example.com');
  clearConsoleEmailLog();

  seedMemoryRequestForTests({
    id: REQUEST_ID,
    senderType: 'human',
    senderName: 'Maya',
    senderContact: 'maya@example.com',
    apiKeyId: null,
    targetUserId: OWNER_ID,
    message: 'Peer founder intro about billing.',
    aiScore: 88,
    aiReason: 'fit',
    aiReasonPublic: 'Strong peer fit',
    decision: 'accept',
    ownerDecision: null,
    decidedAt: null,
    status: 'delivered',
    stakeCents: 0,
    helpful: null,
    createdAt: new Date(),
  });

  const send = createConsoleEmailSender();
  const owner = {
    id: OWNER_ID,
    email: 'ada@example.com',
    name: 'Ada',
  };

  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      approveInboxRequest({
        requestId: REQUEST_ID,
        owner,
        send,
      }),
    ),
  );

  const ok = results.filter((r) => r.ok);
  const conflicts = results.filter((r) => !r.ok && r.status === 409);
  assert.equal(ok.length, 1, 'exactly one approve should succeed');
  assert.equal(conflicts.length, 4, 'four approves should 409');
  for (const c of conflicts) {
    assert.equal(c.ok, false);
    if (!c.ok) assert.equal(c.error, ALREADY_DECIDED_ERROR);
  }

  assert.equal(
    countOutboundEmailsForTests(OUTBOUND_EMAIL_TYPES.introConnected),
    1,
    'exactly one outbound_emails row',
  );

  const connected = getConsoleEmailLog().filter((e) =>
    /You're connected via Gatekeeper/i.test(e.text),
  );
  assert.equal(connected.length, 1, 'exactly one connected email sent');

  setSenderVerifiedForTests(null);
  if (previousSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = previousSecret;
});
