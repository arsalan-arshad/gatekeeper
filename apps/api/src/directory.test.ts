import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DIRECTORY_EXCLUDED_HANDLES,
  decodeDirectoryCursor,
  encodeDirectoryCursor,
  escapeIlikePattern,
  expectedDirectoryPublicKeys,
  isVisibleInDirectory,
  listDirectory,
  parseDirectoryTagsQuery,
  resetMemoryDirectoryForTests,
  seedMemoryDirectoryUserForTests,
  seedMemorySuppressedEmailForTests,
  toDirectoryPublicEntry,
  useMemoryDirectoryForTests,
  validateDirectoryTags,
  type DirectoryUserRow,
} from './directory.ts';
import { buildServer } from './index.ts';
import { signInternalToken } from './internal-auth.ts';
import { resetRateLimitersForTests, useMemoryRateLimitersForTests } from './rate-limit.ts';

const SECRET = 'directory-test-secret-32chars!!!!';

function baseUser(overrides: Partial<DirectoryUserRow> = {}): DirectoryUserRow {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    handle: 'founder',
    name: 'Founder One',
    email: 'founder@example.com',
    bio: 'Builds tools for indie SaaS',
    wantsText: 'Looking for mobile engineers',
    offersText: 'Design partner intros',
    neverText: 'Never crypto spam',
    directoryOptIn: true,
    directoryRole: 'Founder',
    directoryTags: ['saas', 'mobile'],
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    profileEmbedding: [0.1, 0.2],
    plan: 'pro',
    lemonCustomerId: 'lem_secret',
    lemonSubscriptionId: 'sub_secret',
    notificationEmailMode: 'instant',
    ruleText: 'private rules',
    minRelevance: 70,
    ...overrides,
  };
}

test('toDirectoryPublicEntry only exposes whitelist keys', () => {
  const entry = toDirectoryPublicEntry(baseUser());
  assert.deepEqual(Object.keys(entry).sort(), expectedDirectoryPublicKeys());
  assert.equal('email' in entry, false);
  assert.equal('id' in entry, false);
  assert.equal('neverText' in entry, false);
  assert.equal('ruleText' in entry, false);
  assert.equal('plan' in entry, false);
  assert.equal(entry.profileUrl, '/@founder');
  assert.ok((entry.bio?.length ?? 0) <= 280);
});

test('escapeIlikePattern treats % _ \\ literally', () => {
  assert.equal(escapeIlikePattern('100%_done\\x'), '100\\%\\_done\\\\x');
});

test('validateDirectoryTags rejects bad slugs and >10', () => {
  assert.equal(validateDirectoryTags(['OK Tag']).ok, false);
  assert.equal(validateDirectoryTags(['saas', 'mobile']).ok, true);
  assert.equal(validateDirectoryTags(Array.from({ length: 11 }, (_, i) => `t${i}`)).ok, false);
});

test('cursor round-trips', () => {
  const at = new Date('2026-02-01T12:00:00.000Z');
  const encoded = encodeDirectoryCursor(at, 'abc');
  assert.deepEqual(decodeDirectoryCursor(encoded), { updatedAt: at, id: 'abc' });
  assert.equal(decodeDirectoryCursor('!!!'), null);
});

test('non-opted-in, demo handles, and suppressed emails are invisible', () => {
  assert.equal(isVisibleInDirectory(baseUser({ directoryOptIn: false })), false);
  for (const handle of DIRECTORY_EXCLUDED_HANDLES) {
    assert.equal(isVisibleInDirectory(baseUser({ handle, email: `${handle}@x.com` })), false);
  }
  assert.equal(isVisibleInDirectory(baseUser({ email: 'ada@demo.gatekeeper.local' })), false);
  assert.equal(isVisibleInDirectory(baseUser(), new Set(['founder@example.com'])), false);
});

test('memory directory: search, exclude, cursor, and opt-out', async () => {
  useMemoryDirectoryForTests(true);
  resetMemoryDirectoryForTests();

  seedMemoryDirectoryUserForTests(
    baseUser({
      id: 'a',
      handle: 'alice',
      name: 'Alice',
      email: 'alice@example.com',
      updatedAt: new Date('2026-01-03T00:00:00.000Z'),
    }),
  );
  seedMemoryDirectoryUserForTests(
    baseUser({
      id: 'b',
      handle: 'bob',
      name: 'Bob',
      email: 'bob@example.com',
      directoryRole: 'Engineer',
      directoryTags: ['rust'],
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    }),
  );
  seedMemoryDirectoryUserForTests(
    baseUser({
      id: 'c',
      handle: 'hidden',
      name: 'Hidden Exact',
      email: 'hidden@example.com',
      directoryOptIn: false,
      updatedAt: new Date('2026-01-04T00:00:00.000Z'),
    }),
  );
  seedMemoryDirectoryUserForTests(
    baseUser({
      id: 'd',
      handle: 'ada',
      name: 'Ada Demo',
      email: 'ada@demo.gatekeeper.local',
      updatedAt: new Date('2026-01-05T00:00:00.000Z'),
    }),
  );
  seedMemoryDirectoryUserForTests(
    baseUser({
      id: 'e',
      handle: 'suppressed',
      name: 'Suppressed',
      email: 'suppressed@example.com',
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    }),
  );
  seedMemorySuppressedEmailForTests('suppressed@example.com');

  const byName = await listDirectory({ q: 'Hidden Exact' });
  assert.equal(byName.results.length, 0);

  const all = await listDirectory({ limit: 1 });
  assert.equal(all.results.length, 1);
  assert.equal(all.results[0]?.handle, 'alice');
  assert.ok(all.nextCursor);

  const page2 = await listDirectory({ limit: 1, cursor: all.nextCursor! });
  assert.equal(page2.results.length, 1);
  assert.equal(page2.results[0]?.handle, 'bob');
  assert.notEqual(page2.results[0]?.handle, all.results[0]?.handle);

  const role = await listDirectory({ role: 'Engineer' });
  assert.deepEqual(
    role.results.map((r) => r.handle),
    ['bob'],
  );

  useMemoryDirectoryForTests(false);
});

test('parseDirectoryTagsQuery caps at 5', () => {
  assert.equal(parseDirectoryTagsQuery(['a', 'b', 'c', 'd', 'e', 'f']).ok, false);
  assert.equal(parseDirectoryTagsQuery(['saas']).ok, true);
});

test('GET /v1/directory respects opt-in, whitelist, and rate limit', async () => {
  const previous = process.env.INTERNAL_API_SECRET;
  process.env.INTERNAL_API_SECRET = SECRET;
  useMemoryRateLimitersForTests(true);
  resetRateLimitersForTests();
  useMemoryDirectoryForTests(true);
  resetMemoryDirectoryForTests();

  seedMemoryDirectoryUserForTests(baseUser());
  seedMemoryDirectoryUserForTests(
    baseUser({
      id: '22222222-2222-2222-2222-222222222222',
      handle: 'ghost',
      name: 'Ghost User',
      email: 'ghost@example.com',
      directoryOptIn: false,
    }),
  );

  const app = await buildServer();
  app.log.level = 'silent';

  const ok = await app.inject({ method: 'GET', url: '/v1/directory' });
  assert.equal(ok.statusCode, 200);
  const body = ok.json() as { results: Array<Record<string, unknown>> };
  assert.equal(body.results.length, 1);
  assert.deepEqual(Object.keys(body.results[0]!).sort(), expectedDirectoryPublicKeys());
  assert.equal(ok.headers['cache-control'], 'public, max-age=60');

  const searchHidden = await app.inject({
    method: 'GET',
    url: '/v1/directory?q=Ghost%20User',
  });
  assert.equal(searchHidden.statusCode, 200);
  assert.equal(searchHidden.json().results.length, 0);

  const wild = await app.inject({
    method: 'GET',
    url: `/v1/directory?q=${encodeURIComponent('100%_')}`,
  });
  assert.equal(wild.statusCode, 200);

  resetRateLimitersForTests();
  let limited = 0;
  for (let i = 0; i < 61; i += 1) {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/directory',
      headers: { 'x-forwarded-for': '203.0.113.9' },
    });
    if (res.statusCode === 429) {
      limited += 1;
      assert.ok(res.headers['retry-after']);
    }
  }
  assert.ok(limited >= 1, 'expected 429 after 60/min');

  await app.close();
  useMemoryDirectoryForTests(false);
  if (previous === undefined) delete process.env.INTERNAL_API_SECRET;
  else process.env.INTERNAL_API_SECRET = previous;
});

test('PUT /v1/dashboard/directory auth, validation, and opt-out', async () => {
  const previous = process.env.INTERNAL_API_SECRET;
  process.env.INTERNAL_API_SECRET = SECRET;
  useMemoryDirectoryForTests(true);
  resetMemoryDirectoryForTests();
  seedMemoryDirectoryUserForTests(baseUser());

  const app = await buildServer();
  app.log.level = 'silent';

  const unauth = await app.inject({
    method: 'PUT',
    url: '/v1/dashboard/directory',
    payload: { optIn: true },
  });
  assert.equal(unauth.statusCode, 401);

  const token = signInternalToken('founder@example.com', SECRET);
  const badTags = await app.inject({
    method: 'PUT',
    url: '/v1/dashboard/directory',
    headers: { authorization: `Bearer ${token}` },
    payload: { optIn: true, tags: ['BAD TAG'] },
  });
  assert.equal(badTags.statusCode, 400);

  const tooMany = await app.inject({
    method: 'PUT',
    url: '/v1/dashboard/directory',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      optIn: true,
      tags: Array.from({ length: 11 }, (_, i) => `tag${i}`),
    },
  });
  assert.equal(tooMany.statusCode, 400);

  const optOut = await app.inject({
    method: 'PUT',
    url: '/v1/dashboard/directory',
    headers: { authorization: `Bearer ${token}` },
    payload: { optIn: false, role: 'Founder', tags: ['saas'] },
  });
  assert.equal(optOut.statusCode, 200);

  const listed = await listDirectory({});
  assert.equal(listed.results.length, 0);

  await app.close();
  useMemoryDirectoryForTests(false);
  if (previous === undefined) delete process.env.INTERNAL_API_SECRET;
  else process.env.INTERNAL_API_SECRET = previous;
});

test('onboarding directory fields: omit keeps prior opt-in; explicit default is false', () => {
  // Mirrors POST /v1/onboarding/complete merge rules.
  function mergeDirectoryOnComplete(input: {
    existingOptIn?: boolean;
    bodyOptIn?: boolean;
  }): boolean {
    if (input.bodyOptIn !== undefined) return input.bodyOptIn;
    if (input.existingOptIn !== undefined) return input.existingOptIn;
    return false;
  }
  assert.equal(mergeDirectoryOnComplete({}), false);
  assert.equal(mergeDirectoryOnComplete({ existingOptIn: true }), true);
  assert.equal(mergeDirectoryOnComplete({ existingOptIn: true, bodyOptIn: false }), false);
  assert.equal(mergeDirectoryOnComplete({ bodyOptIn: true }), true);
});
