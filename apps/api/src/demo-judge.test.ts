import assert from 'node:assert/strict';
import { test } from 'node:test';

import { demoJudgeRequest } from './demo-judge.js';
import { buildServer } from './index.js';
import { resetDemoRateLimiterForTests } from './routes/demo.js';

test('demoJudgeRequest accepts a strong indie SaaS peer intro for @demo', () => {
  const result = demoJudgeRequest({
    handle: 'demo',
    message:
      'Hey Sam — I’m a founder shipping a usage-based billing SaaS for indie tools. Would love a short peer intro to compare Stripe edge cases and founder-led sales.',
  });
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.decision, 'accept');
  assert.ok(result.score >= 70);
  assert.equal(result.suggested_rewrite, null);
  assert.doesNotMatch(result.reason_public, /gate.?rules|private/i);
});

test('demoJudgeRequest marks crypto pitches as spam', () => {
  const result = demoJudgeRequest({
    handle: 'demo',
    message: 'Hot crypto NFT token launch — guaranteed leads for your SaaS!!',
  });
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.decision, 'spam');
  assert.ok(result.suggested_rewrite);
});

test('POST /v1/demo/judge is IP rate limited and omits private reasons', async () => {
  resetDemoRateLimiterForTests();
  const app = await buildServer();

  const ok = await app.inject({
    method: 'POST',
    url: '/v1/demo/judge',
    headers: { 'x-forwarded-for': '203.0.113.50' },
    payload: {
      handle: 'demo',
      message:
        'Peer founder note about B2B SaaS billing — concrete ask to compare TypeScript invoicing edge cases.',
    },
  });
  assert.equal(ok.statusCode, 200);
  const body = ok.json() as Record<string, unknown>;
  assert.equal(typeof body.score, 'number');
  assert.ok(['accept', 'reject', 'spam'].includes(String(body.decision)));
  assert.equal(body.reason_private, undefined);

  for (let i = 0; i < 12; i += 1) {
    await app.inject({
      method: 'POST',
      url: '/v1/demo/judge',
      headers: { 'x-forwarded-for': '203.0.113.50' },
      payload: { handle: 'demo', message: `probe ${i} founder saas billing typescript peer` },
    });
  }

  const limited = await app.inject({
    method: 'POST',
    url: '/v1/demo/judge',
    headers: { 'x-forwarded-for': '203.0.113.50' },
    payload: { handle: 'demo', message: 'another founder saas billing note' },
  });
  assert.equal(limited.statusCode, 429);

  await app.close();
});
