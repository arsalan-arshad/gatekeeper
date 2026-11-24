import assert from 'node:assert/strict';
import { test } from 'node:test';

import { approveInboxRequest } from './approve-request.ts';
import { EmailSendError } from './email.ts';
import { clearConsoleEmailLog, getConsoleEmailLog } from './email.ts';
import { buildServer } from './index.ts';
import { signInternalToken } from './internal-auth.ts';
import {
  listMemoryMatchesForTests,
  resetMatchDecisionsForTests,
  useMemoryMatchDecisionsForTests,
} from './match-decision.ts';
import {
  countMatchOutboundEmailsForTests,
  MATCH_EMAIL_TYPES,
  resetMatchOutboundEmailsForTests,
  useMemoryMatchOutboundEmailsForTests,
} from './match-outbound-email.ts';
import {
  emptyExclusions,
  resetMemoryMatchingForTests,
  seedMemoryExclusionsForTests,
  seedMemoryMatchCandidateForTests,
  useMemoryMatchingForTests,
  type MatchCandidate,
} from './matching.ts';
import {
  countOutboundEmailsForTests,
  OUTBOUND_EMAIL_TYPES,
  resetOutboundEmailsForTests,
  useMemoryOutboundEmailsForTests,
} from './outbound-email.ts';
import { sanitizeServerAnalyticsProps } from './posthog-sanitize.ts';
import { resetOwnerDecisionsForTests, seedMemoryRequestForTests } from './owner-decision.ts';
import { resetRateLimitersForTests, useMemoryRateLimitersForTests } from './rate-limit.ts';
import { resetSenderOutboundLimiterForTests, setSenderVerifiedForTests } from './sender-verify.ts';

const SECRET = 'match-request-test-secret-32chars!!!!';
const NOTE = 'We should collaborate on mobile hiring workflows together soon.';

function vec(n: number, fill = 1): number[] {
  return Array.from({ length: n }, () => fill);
}

function candidate(
  overrides: Partial<MatchCandidate> & Pick<MatchCandidate, 'id' | 'handle' | 'email' | 'name'>,
): MatchCandidate {
  return {
    bio: 'Bio',
    wantsText: 'mobile engineers',
    offersText: 'design partners',
    neverText: 'crypto',
    directoryOptIn: true,
    directoryRole: 'Founder',
    directoryTags: ['saas'],
    updatedAt: new Date(),
    wantsEmbedding: vec(8, 1),
    offersEmbedding: vec(8, 0.5),
    notificationEmailMode: 'off',
    ...overrides,
  };
}

async function postMatchRequest(
  app: Awaited<ReturnType<typeof buildServer>>,
  email: string,
  handle: string,
) {
  const token = signInternalToken(email, SECRET);
  return app.inject({
    method: 'POST',
    url: '/v1/dashboard/matches/request',
    headers: { authorization: `Bearer ${token}` },
    payload: { handle, note: NOTE },
  });
}

test('POST /v1/dashboard/matches/request: 6th by requester → 429 retry-after', async () => {
  const previous = process.env.INTERNAL_API_SECRET;
  const previousAuth = process.env.AUTH_SECRET;
  process.env.INTERNAL_API_SECRET = SECRET;
  process.env.AUTH_SECRET = SECRET;

  useMemoryRateLimitersForTests(true);
  resetRateLimitersForTests();
  useMemoryMatchingForTests(true);
  resetMemoryMatchingForTests();
  useMemoryMatchDecisionsForTests(true);
  resetMatchDecisionsForTests();
  useMemoryMatchOutboundEmailsForTests(true);
  resetMatchOutboundEmailsForTests();
  clearConsoleEmailLog();

  const requester = candidate({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    handle: 'requester',
    email: 'requester@example.com',
    name: 'Requester',
  });
  seedMemoryMatchCandidateForTests(requester);
  seedMemoryExclusionsForTests(requester.id, emptyExclusions());

  for (let i = 0; i < 6; i += 1) {
    seedMemoryMatchCandidateForTests(
      candidate({
        id: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb${i.toString().padStart(2, '0')}`,
        handle: `recv${i}`,
        email: `recv${i}@example.com`,
        name: `Recv ${i}`,
      }),
    );
  }

  const app = await buildServer();
  app.log.level = 'silent';

  for (let i = 0; i < 5; i += 1) {
    const res = await postMatchRequest(app, requester.email, `recv${i}`);
    assert.equal(res.statusCode, 200, `request ${i + 1} should succeed`);
    assert.equal(res.json().status, 'pending');
  }

  const limited = await postMatchRequest(app, requester.email, 'recv5');
  assert.equal(limited.statusCode, 429);
  assert.ok(limited.headers['retry-after']);
  assert.match(String(limited.json().error), /rate limit/i);

  await app.close();
  useMemoryMatchingForTests(false);
  if (previous === undefined) delete process.env.INTERNAL_API_SECRET;
  else process.env.INTERNAL_API_SECRET = previous;
  if (previousAuth === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = previousAuth;
});

test('POST /v1/dashboard/matches/request: 11th incoming for recipient → 429 retry-after', async () => {
  const previous = process.env.INTERNAL_API_SECRET;
  const previousAuth = process.env.AUTH_SECRET;
  process.env.INTERNAL_API_SECRET = SECRET;
  process.env.AUTH_SECRET = SECRET;

  useMemoryRateLimitersForTests(true);
  resetRateLimitersForTests();
  useMemoryMatchingForTests(true);
  resetMemoryMatchingForTests();
  useMemoryMatchDecisionsForTests(true);
  resetMatchDecisionsForTests();
  useMemoryMatchOutboundEmailsForTests(true);
  resetMatchOutboundEmailsForTests();

  const recipient = candidate({
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    handle: 'popular',
    email: 'popular@example.com',
    name: 'Popular',
  });
  seedMemoryMatchCandidateForTests(recipient);

  for (let i = 0; i < 11; i += 1) {
    const requester = candidate({
      id: `dddddddd-dddd-4ddd-8ddd-dddddddddd${i.toString().padStart(2, '0')}`,
      handle: `req${i}`,
      email: `req${i}@example.com`,
      name: `Req ${i}`,
    });
    seedMemoryMatchCandidateForTests(requester);
    seedMemoryExclusionsForTests(requester.id, emptyExclusions());
  }

  const app = await buildServer();
  app.log.level = 'silent';

  for (let i = 0; i < 10; i += 1) {
    const res = await postMatchRequest(app, `req${i}@example.com`, 'popular');
    assert.equal(res.statusCode, 200, `incoming ${i + 1} should succeed`);
  }

  const limited = await postMatchRequest(app, 'req10@example.com', 'popular');
  assert.equal(limited.statusCode, 429);
  assert.ok(limited.headers['retry-after']);
  assert.match(String(limited.json().error), /Recipient match rate limit/i);

  await app.close();
  useMemoryMatchingForTests(false);
  if (previous === undefined) delete process.env.INTERNAL_API_SECRET;
  else process.env.INTERNAL_API_SECRET = previous;
  if (previousAuth === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = previousAuth;
});

test('A→B twice and B→A after A→B → already_requested; no second row/email; never 500', async () => {
  const previous = process.env.INTERNAL_API_SECRET;
  const previousAuth = process.env.AUTH_SECRET;
  process.env.INTERNAL_API_SECRET = SECRET;
  process.env.AUTH_SECRET = SECRET;

  useMemoryRateLimitersForTests(true);
  resetRateLimitersForTests();
  useMemoryMatchingForTests(true);
  resetMemoryMatchingForTests();
  useMemoryMatchDecisionsForTests(true);
  resetMatchDecisionsForTests();
  useMemoryMatchOutboundEmailsForTests(true);
  resetMatchOutboundEmailsForTests();
  clearConsoleEmailLog();

  const userA = candidate({
    id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
    handle: 'alice',
    email: 'alice@example.com',
    name: 'Alice',
    notificationEmailMode: 'instant',
  });
  const userB = candidate({
    id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
    handle: 'bob',
    email: 'bob@example.com',
    name: 'Bob',
    notificationEmailMode: 'instant',
  });
  seedMemoryMatchCandidateForTests(userA);
  seedMemoryMatchCandidateForTests(userB);
  seedMemoryExclusionsForTests(userA.id, emptyExclusions());
  seedMemoryExclusionsForTests(userB.id, emptyExclusions());

  const app = await buildServer();
  app.log.level = 'silent';

  const first = await postMatchRequest(app, userA.email, 'bob');
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().status, 'pending');
  const matchId = first.json().matchId as string;
  assert.ok(matchId);
  assert.equal(listMemoryMatchesForTests().length, 1);
  const emailsAfterFirst = getConsoleEmailLog().length;
  assert.equal(emailsAfterFirst, 1);
  assert.equal(countMatchOutboundEmailsForTests(MATCH_EMAIL_TYPES.matchRequestNotify), 1);

  const second = await postMatchRequest(app, userA.email, 'bob');
  assert.equal(second.statusCode, 200);
  assert.deepEqual(second.json(), { status: 'already_requested', matchId });
  assert.equal(listMemoryMatchesForTests().length, 1);
  assert.equal(getConsoleEmailLog().length, emailsAfterFirst);

  const reverse = await postMatchRequest(app, userB.email, 'alice');
  assert.equal(reverse.statusCode, 200);
  assert.deepEqual(reverse.json(), { status: 'already_requested', matchId });
  assert.equal(listMemoryMatchesForTests().length, 1);
  assert.equal(getConsoleEmailLog().length, emailsAfterFirst);

  await app.close();
  useMemoryMatchingForTests(false);
  if (previous === undefined) delete process.env.INTERNAL_API_SECRET;
  else process.env.INTERNAL_API_SECRET = previous;
  if (previousAuth === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = previousAuth;
});

test('approveInboxRequest EmailSendError → accepted + introEmail failed, slot released, no throw', async () => {
  const previousAuth = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = SECRET;

  useMemoryOutboundEmailsForTests(true);
  resetOutboundEmailsForTests();
  resetOwnerDecisionsForTests();
  resetSenderOutboundLimiterForTests();
  setSenderVerifiedForTests('maya@example.com');

  const requestId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const ownerId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  seedMemoryRequestForTests({
    id: requestId,
    senderType: 'human',
    senderName: 'Maya',
    senderContact: 'maya@example.com',
    apiKeyId: null,
    targetUserId: ownerId,
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

  const failingSend = async () => {
    throw new EmailSendError(500, 'server_error');
  };

  const result = await approveInboxRequest({
    requestId,
    owner: { id: ownerId, email: 'ada@example.com', name: 'Ada' },
    send: failingSend,
  });

  assert.deepEqual(result, { ok: true, status: 'accepted', introEmail: 'failed' });
  assert.equal(countOutboundEmailsForTests(OUTBOUND_EMAIL_TYPES.introConnected), 0);

  setSenderVerifiedForTests(null);
  if (previousAuth === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = previousAuth;
});

test('match_shown / match_requested / match_accepted props sanitize cleanly without PII', () => {
  const shown = sanitizeServerAnalyticsProps({
    count: 3,
    email: 'a@b.com',
    name: 'Ada',
    handle: 'ada',
    note: 'secret note',
    similarity: 0.91,
  });
  assert.deepEqual(shown, { count: 3 });

  const requested = sanitizeServerAnalyticsProps({
    score_band: 'strong',
    email: 'a@b.com',
    name: 'Ada',
    handle: 'ada',
    note: 'hello',
    similarity: 0.82,
  });
  assert.deepEqual(requested, { score_band: 'strong' });

  const accepted = sanitizeServerAnalyticsProps({
    score_band: 'good',
    email: 'a@b.com',
    name: 'Bob',
    handle: 'bob',
    note: 'note',
    similarity: 0.61,
  });
  assert.deepEqual(accepted, { score_band: 'good' });
});
