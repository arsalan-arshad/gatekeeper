import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildOffersEmbeddingText, buildWantsEmbeddingText } from './interview.ts';
import {
  claimMatchDecision,
  resetMatchDecisionsForTests,
  seedMemoryMatchForTests,
  useMemoryMatchDecisionsForTests,
} from './match-decision.ts';
import {
  emptyExclusions,
  mutualFitSimilarity,
  rankMatchesForViewer,
  scoreBandFromSimilarity,
  type MatchCandidate,
} from './matching.ts';
import { isIntroMatchPairUniqueViolation } from './pg-errors.ts';
import { createMatchToken, verifyMatchToken } from './tokens.ts';

function vec(n: number, fill = 1): number[] {
  return Array.from({ length: n }, () => fill);
}

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    handle: 'alice',
    name: 'Alice',
    email: 'alice@example.com',
    bio: 'Founder bio',
    wantsText: 'mobile engineers',
    offersText: 'design partners',
    neverText: 'crypto',
    directoryOptIn: true,
    directoryRole: 'Founder',
    directoryTags: ['saas'],
    updatedAt: new Date(),
    wantsEmbedding: vec(8, 1),
    offersEmbedding: vec(8, 0.5),
    ...overrides,
  };
}

test('buildWants/Offers embedding text never includes never or rules', () => {
  const wants = buildWantsEmbeddingText({
    wantsText: 'hire mobile',
    directoryRole: 'Founder',
    directoryTags: ['saas'],
  });
  assert.match(wants, /hire mobile/);
  assert.doesNotMatch(wants, /never|rule/i);

  const offersEmpty = buildOffersEmbeddingText({
    offersText: '',
    bio: 'Builds APIs',
    directoryRole: 'Engineer',
    directoryTags: ['rust'],
  });
  assert.match(offersEmpty, /Builds APIs/);
  assert.match(offersEmpty, /Engineer/);
});

test('mutual fit is symmetric', () => {
  const a = { wantsEmbedding: vec(4, 1), offersEmbedding: vec(4, 0) };
  const b = { wantsEmbedding: vec(4, 0), offersEmbedding: vec(4, 1) };
  const ab = mutualFitSimilarity(a, b);
  const ba = mutualFitSimilarity(b, a);
  assert.equal(ab, ba);
  assert.ok((ab ?? 0) > 0);
});

test('ranking excludes self, non-opted-in, dismissed, matched, prior, spam, demo, missing vectors', () => {
  const viewer = candidate({ id: 'viewer', handle: 'viewer', email: 'v@example.com' });
  const good = candidate({
    id: 'good',
    handle: 'good',
    email: 'good@example.com',
    wantsEmbedding: vec(8, 1),
    offersEmbedding: vec(8, 1),
  });
  const exclusions = emptyExclusions();
  exclusions.dismissedUserIds.add('dismissed');
  exclusions.matchedUserIds.add('matched');
  exclusions.priorRequestUserIds.add('prior');
  exclusions.spamBlockedUserIds.add('spam');

  const ranked = rankMatchesForViewer({
    viewer,
    candidates: [
      good,
      candidate({ id: 'viewer', handle: 'viewer', email: 'v@example.com' }),
      candidate({ id: 'off', handle: 'off', email: 'off@example.com', directoryOptIn: false }),
      candidate({ id: 'dismissed', handle: 'd', email: 'd@example.com' }),
      candidate({ id: 'matched', handle: 'm', email: 'm@example.com' }),
      candidate({ id: 'prior', handle: 'p', email: 'p@example.com' }),
      candidate({ id: 'spam', handle: 's', email: 's@example.com' }),
      candidate({ id: 'demo', handle: 'ada', email: 'ada@x.com' }),
      candidate({
        id: 'novec',
        handle: 'novec',
        email: 'n@example.com',
        wantsEmbedding: null,
        offersEmbedding: null,
      }),
    ],
    exclusions,
    minSimilarity: 0,
  });

  assert.deepEqual(
    ranked.map((r) => r.user.handle),
    ['good'],
  );
  assert.equal(ranked[0]?.matchId, null);
  assert.ok(ranked[0]?.scoreBand === 'strong' || ranked[0]?.scoreBand === 'good');
});

test('non-opted-in viewer gets empty list', () => {
  const viewer = candidate({ directoryOptIn: false });
  const ranked = rankMatchesForViewer({
    viewer,
    candidates: [candidate({ id: 'good', handle: 'good', email: 'g@example.com' })],
    exclusions: emptyExclusions(),
  });
  assert.equal(ranked.length, 0);
});

test('scoreBandFromSimilarity thresholds', () => {
  assert.equal(scoreBandFromSimilarity(0.71), 'strong');
  assert.equal(scoreBandFromSimilarity(0.55), 'good');
});

test('claimMatchDecision: concurrent accepts → one claim; IDOR and expiry', async () => {
  useMemoryMatchDecisionsForTests(true);
  resetMatchDecisionsForTests();
  const matchId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const recipientId = '11111111-2222-3333-4444-555555555555';
  seedMemoryMatchForTests({
    id: matchId,
    requesterId: '99999999-9999-9999-9999-999999999999',
    recipientId,
    note: 'We should meet about mobile hiring and design partners together.',
    similarity: 0.8,
    aiScore: 90,
    aiDecision: 'accept',
    aiReasonPublic: 'fit',
    status: 'pending',
    recipientDecision: null,
    decidedAt: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date(),
  });

  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      claimMatchDecision({
        matchId,
        recipientId,
        decision: 'accept',
        status: 'accepted',
      }),
    ),
  );
  assert.equal(results.filter((r) => r.claimed).length, 1);
  assert.equal(results.filter((r) => !r.claimed).length, 4);

  const idor = await claimMatchDecision({
    matchId,
    recipientId: '00000000-0000-0000-0000-000000000000',
    decision: 'accept',
    status: 'accepted',
  });
  assert.equal(idor.claimed, false);
  if (!idor.claimed) assert.equal(idor.reason, 'not_found');

  resetMatchDecisionsForTests();
  seedMemoryMatchForTests({
    id: matchId,
    requesterId: '99999999-9999-9999-9999-999999999999',
    recipientId,
    note: 'We should meet about mobile hiring and design partners together.',
    similarity: 0.8,
    aiScore: 90,
    aiDecision: 'accept',
    aiReasonPublic: 'fit',
    status: 'pending',
    recipientDecision: null,
    decidedAt: null,
    expiresAt: new Date(Date.now() - 1000),
    createdAt: new Date(),
  });
  const expired = await claimMatchDecision({
    matchId,
    recipientId,
    decision: 'accept',
    status: 'accepted',
  });
  assert.equal(expired.claimed, false);
  if (!expired.claimed) assert.equal(expired.reason, 'expired');
});

test('match tokens reject wrong matchId/action/expiry', () => {
  const previous = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = 'match-token-test-secret-32chars!!!!';
  const token = createMatchToken({ matchId: 'm1', action: 'accept' });
  assert.equal(verifyMatchToken(token, { matchId: 'm1', action: 'accept' }).ok, true);
  assert.equal(verifyMatchToken(token, { matchId: 'm2', action: 'accept' }).ok, false);
  assert.equal(verifyMatchToken(token, { matchId: 'm1', action: 'decline' }).ok, false);
  const expired = createMatchToken({ matchId: 'm1', action: 'accept', exp: 1 });
  assert.equal(verifyMatchToken(expired, { matchId: 'm1', action: 'accept' }).ok, false);
  if (previous === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = previous;
});

test('isIntroMatchPairUniqueViolation detects pair index', () => {
  assert.equal(
    isIntroMatchPairUniqueViolation({
      code: '23505',
      constraint: 'intro_matches_pair_live',
    }),
    true,
  );
  assert.equal(
    isIntroMatchPairUniqueViolation({ code: '23505', constraint: 'users_handle_unique' }),
    false,
  );
});
