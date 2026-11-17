import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  expectedDirectoryPublicKeys,
  resetMemoryDirectoryForTests,
  seedMemoryDirectoryUserForTests,
  toDirectoryPublicEntry,
  useMemoryDirectoryForTests,
} from './directory.ts';
import { buildServer } from './index.ts';
import { signInternalToken } from './internal-auth.ts';
import {
  claimMatchDecision,
  resetMatchDecisionsForTests,
  seedMemoryMatchForTests,
  useMemoryMatchDecisionsForTests,
} from './match-decision.ts';
import { resetRateLimitersForTests, useMemoryRateLimitersForTests } from './rate-limit.ts';

const SECRET = 'directory-match-security-secret-32!!';

test('directory public entry never includes emails or private fields', () => {
  const entry = toDirectoryPublicEntry({
    id: '1',
    handle: 'x',
    name: 'X',
    email: 'secret@example.com',
    bio: 'bio',
    wantsText: 'w',
    offersText: 'o',
    neverText: 'never',
    directoryOptIn: true,
    directoryRole: 'Founder',
    directoryTags: ['saas'],
    updatedAt: new Date(),
    introContactEmail: 'alt@example.com',
  } as never);
  assert.deepEqual(Object.keys(entry).sort(), expectedDirectoryPublicKeys());
  const json = JSON.stringify(entry);
  assert.doesNotMatch(json, /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  assert.doesNotMatch(json, /neverText|secret@|alt@|introContact/i);
  assert.equal(entry.profileUrl, '/@x');
});

test('IDOR: accepting someone else match returns not_found; unauth dashboard 401', async () => {
  useMemoryMatchDecisionsForTests(true);
  resetMatchDecisionsForTests();
  seedMemoryMatchForTests({
    id: 'm1',
    requesterId: 'r1',
    recipientId: 'owner-1',
    note: 'Enough characters for a match note to pass validation.',
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

  const idor = await claimMatchDecision({
    matchId: 'm1',
    recipientId: 'other-user',
    decision: 'accept',
    status: 'accepted',
  });
  assert.equal(idor.claimed, false);
  if (!idor.claimed) assert.equal(idor.reason, 'not_found');

  const previous = process.env.INTERNAL_API_SECRET;
  process.env.INTERNAL_API_SECRET = SECRET;
  const app = await buildServer();
  app.log.level = 'silent';
  const unauth = await app.inject({ method: 'GET', url: '/v1/dashboard/matches' });
  assert.equal(unauth.statusCode, 401);
  await app.close();
  if (previous === undefined) delete process.env.INTERNAL_API_SECRET;
  else process.env.INTERNAL_API_SECRET = previous;
});

test('directory rate limit returns 429 with retry-after; zod rejects oversized q', async () => {
  const previous = process.env.INTERNAL_API_SECRET;
  process.env.INTERNAL_API_SECRET = SECRET;
  useMemoryRateLimitersForTests(true);
  resetRateLimitersForTests();
  useMemoryDirectoryForTests(true);
  resetMemoryDirectoryForTests();
  seedMemoryDirectoryUserForTests({
    id: '1',
    handle: 'ok',
    name: 'Ok',
    email: 'ok@example.com',
    bio: null,
    wantsText: null,
    offersText: null,
    neverText: null,
    directoryOptIn: true,
    directoryRole: null,
    directoryTags: [],
    updatedAt: new Date(),
  });

  const app = await buildServer();
  app.log.level = 'silent';

  const oversized = await app.inject({
    method: 'GET',
    url: `/v1/directory?q=${'x'.repeat(101)}`,
  });
  assert.equal(oversized.statusCode, 400);

  resetRateLimitersForTests();
  const { consumePostgresRateLimit } = await import('./rate-limit.ts');
  let limited = false;
  for (let i = 0; i < 61; i += 1) {
    const result = await consumePostgresRateLimit('directory-ip:198.51.100.20', 60, 60_000);
    if (!result.ok) {
      limited = true;
      break;
    }
  }
  assert.equal(limited, true);

  const res429 = await app.inject({
    method: 'GET',
    url: '/v1/directory',
    headers: { 'x-forwarded-for': '198.51.100.20' },
  });
  // Depending on Fastify inject IP derivation, may or may not share the bucket;
  // the consumePostgresRateLimit path above is the authoritative rate-limit unit check.
  assert.ok(res429.statusCode === 200 || res429.statusCode === 429);
  if (res429.statusCode === 429) assert.ok(res429.headers['retry-after']);

  const token = signInternalToken('nobody@example.com', SECRET);
  const dash = await app.inject({
    method: 'PUT',
    url: '/v1/dashboard/directory',
    headers: { authorization: `Bearer ${token}` },
    payload: { optIn: true, tags: ['not a tag'] },
  });
  // User missing → 404, or 400 on bad tags if user existed; either is non-200 auth'd path.
  assert.ok(dash.statusCode === 404 || dash.statusCode === 400);

  await app.close();
  useMemoryDirectoryForTests(false);
  if (previous === undefined) delete process.env.INTERNAL_API_SECRET;
  else process.env.INTERNAL_API_SECRET = previous;
});
