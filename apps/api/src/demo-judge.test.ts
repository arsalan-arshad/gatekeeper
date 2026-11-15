import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEMO_ACCEPT_THRESHOLD, DEMO_BUSY_ERROR, demoJudgeRequest } from './demo-judge.js';
import { buildServer } from './index.js';
import type { Llm, LlmProvider } from './llm.js';
import { resetDemoRateLimiterForTests, setDemoLlmForTests } from './routes/demo.js';

const STRONG_MESSAGE =
  'Hey Sam — I’m Maya, founder of a usage-based billing SaaS for indie B2B tools (invoicing + metered overages). I’d love a short peer intro to compare Stripe Billing edge cases and founder-led sales — happy to share what we learned on dunning too.';

const SPAM_MESSAGE = 'Hot crypto NFT token launch — guaranteed leads for your SaaS!!';
const WEAK_MESSAGE =
  'Hey — would love to pick your brain over coffee sometime and hear your founder journey. No specific ask yet, just a quick sync!';

function mockLlm(options: {
  embedding?: number[];
  completion: string;
  fail?: boolean;
}): Llm & { provider: LlmProvider } {
  const provider: LlmProvider = {
    name: 'mock',
    async complete() {
      if (options.fail) throw new Error('provider down');
      return options.completion;
    },
    async embed() {
      if (options.fail) throw new Error('provider down');
      return options.embedding ?? [0.5, 0.5, 0.1];
    },
  };

  return {
    providerName: 'mock',
    provider,
    complete: (messages, completeOptions) => provider.complete(messages, completeOptions),
    embed: (text) => provider.embed(text),
    clearEmbeddingCache() {},
    getDailyUsage() {
      return 0;
    },
    async healthCheck() {
      return [{ provider: 'gemini', ok: !options.fail, model: 'mock', error: null }];
    },
  };
}

test('demoJudgeRequest accept threshold is 60', () => {
  assert.equal(DEMO_ACCEPT_THRESHOLD, 60);
});

test('demoJudgeRequest accepts a strong indie SaaS peer intro for @demo', async () => {
  const llm = mockLlm({
    completion: JSON.stringify({
      score: 88,
      decision: 'accept',
      reason_public:
        'Concrete peer founder ask about usage-based billing — strong fit for a double-opt-in intro.',
      reason_private: 'matches wants; clear CTA',
      suggested_rewrite: null,
      deal_breaker_hit: false,
    }),
  });

  const result = await demoJudgeRequest(
    { handle: 'demo', message: STRONG_MESSAGE, senderName: 'Maya' },
    llm,
  );
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.decision, 'accept');
  assert.ok(result.score >= DEMO_ACCEPT_THRESHOLD);
  assert.equal(result.suggested_rewrite, null);
  assert.match(result.reason_public, /billing|founder|peer|intro/i);
  assert.doesNotMatch(result.reason_public, /gate.?rules|private/i);
});

test('demoJudgeRequest marks crypto pitches as spam with request-specific reason', async () => {
  const llm = mockLlm({
    completion: JSON.stringify({
      score: 6,
      decision: 'spam',
      reason_public: 'Crypto/NFT cold pitch hits a deal-breaker — blocked as spam.',
      reason_private: 'deal breaker crypto',
      suggested_rewrite: null,
      deal_breaker_hit: true,
    }),
  });

  const result = await demoJudgeRequest({ handle: 'demo', message: SPAM_MESSAGE }, llm);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.decision, 'spam');
  assert.equal(result.suggested_rewrite, null);
  assert.match(result.reason_public, /crypto|nft|spam|deal-breaker|promo/i);
});

test('demoJudgeRequest rejects vague coffee chats for @demo', async () => {
  const llm = mockLlm({
    completion: JSON.stringify({
      score: 34,
      decision: 'reject',
      reason_public: 'A vague coffee chat without a written ask is not a strong fit right now.',
      reason_private: 'vague',
      suggested_rewrite:
        'Hi Sam — I’m Alex, a founder shipping usage-based invoicing. I’d love a short written intro about Stripe metered billing.',
      deal_breaker_hit: false,
    }),
  });

  const result = await demoJudgeRequest(
    { handle: 'demo', message: WEAK_MESSAGE, senderName: 'Alex' },
    llm,
  );
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.decision, 'reject');
  assert.ok(result.score >= 26 && result.score <= 59);
  assert.ok(result.suggested_rewrite);
});

test('strong request scores higher than spam', async () => {
  const strongLlm = mockLlm({
    completion: JSON.stringify({
      score: 86,
      decision: 'accept',
      reason_public: 'Relevant peer SaaS founder with a concrete billing ask.',
      reason_private: 'ok',
      suggested_rewrite: null,
      deal_breaker_hit: false,
    }),
  });
  const spamLlm = mockLlm({
    completion: JSON.stringify({
      score: 9,
      decision: 'spam',
      reason_public: 'Token/NFT blast — spam.',
      reason_private: 'spam',
      suggested_rewrite: null,
      deal_breaker_hit: true,
    }),
  });

  const strong = await demoJudgeRequest({ handle: 'demo', message: STRONG_MESSAGE }, strongLlm);
  const spam = await demoJudgeRequest({ handle: 'demo', message: SPAM_MESSAGE }, spamLlm);
  assert.ok(!('error' in strong) && !('error' in spam));
  if ('error' in strong || 'error' in spam) return;
  assert.ok(strong.score > spam.score);
  assert.equal(strong.decision, 'accept');
  assert.equal(spam.decision, 'spam');
});

test('demoJudgeRequest returns busy error on LLM failure — no fake verdict', async () => {
  const llm = mockLlm({ completion: '{}', fail: true });
  const result = await demoJudgeRequest({ handle: 'demo', message: STRONG_MESSAGE }, llm);
  assert.ok('error' in result);
  if (!('error' in result)) return;
  assert.equal(result.error, DEMO_BUSY_ERROR);
  assert.equal('busy' in result && result.busy, true);
  assert.equal('decision' in result, false);
  assert.equal('score' in result, false);
});

test('POST /v1/demo/judge is IP rate limited (20/day), exposes remaining, cache exempt', async () => {
  resetDemoRateLimiterForTests();
  setDemoLlmForTests(
    mockLlm({
      completion: JSON.stringify({
        score: 75,
        decision: 'accept',
        reason_public: 'Peer founder billing intro looks relevant.',
        reason_private: 'secret rules',
        suggested_rewrite: null,
        deal_breaker_hit: false,
      }),
    }),
  );

  try {
    const app = await buildServer();

    const ok = await app.inject({
      method: 'POST',
      url: '/v1/demo/judge',
      headers: { 'x-forwarded-for': '203.0.113.50' },
      payload: {
        handle: 'demo',
        message: STRONG_MESSAGE,
      },
    });
    assert.equal(ok.statusCode, 200);
    const body = ok.json() as Record<string, unknown>;
    assert.equal(typeof body.score, 'number');
    assert.ok(['accept', 'reject', 'spam'].includes(String(body.decision)));
    assert.equal(body.reason_private, undefined);
    assert.equal(body.limit, 20);
    assert.equal(body.remaining, 19);
    assert.equal(body.cached, false);

    // Cached replay does not consume more of the daily budget.
    const cached = await app.inject({
      method: 'POST',
      url: '/v1/demo/judge',
      headers: { 'x-forwarded-for': '203.0.113.50' },
      payload: { handle: 'demo', message: STRONG_MESSAGE },
    });
    assert.equal(cached.statusCode, 200);
    const cachedBody = cached.json() as Record<string, unknown>;
    assert.equal(cachedBody.cached, true);
    assert.equal(cachedBody.remaining, 19);

    // 19 more unique messages → daily cap of 20.
    for (let i = 0; i < 19; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/demo/judge',
        headers: { 'x-forwarded-for': '203.0.113.50' },
        payload: { handle: 'demo', message: `probe ${i} founder saas billing typescript peer` },
      });
      assert.equal(res.statusCode, 200, `probe ${i}`);
    }

    const limited = await app.inject({
      method: 'POST',
      url: '/v1/demo/judge',
      headers: { 'x-forwarded-for': '203.0.113.50' },
      payload: { handle: 'demo', message: 'another founder saas billing note' },
    });
    assert.equal(limited.statusCode, 429);
    const limitedBody = limited.json() as Record<string, unknown>;
    assert.equal(limitedBody.remaining, 0);

    // Cached chip still works after limit.
    const cachedAfter = await app.inject({
      method: 'POST',
      url: '/v1/demo/judge',
      headers: { 'x-forwarded-for': '203.0.113.50' },
      payload: { handle: 'demo', message: STRONG_MESSAGE },
    });
    assert.equal(cachedAfter.statusCode, 200);
    assert.equal((cachedAfter.json() as { cached?: boolean }).cached, true);

    await app.close();
  } finally {
    setDemoLlmForTests(undefined);
    resetDemoRateLimiterForTests();
  }
});

test('POST /v1/demo/judge returns 503 AI busy when LLM fails', async () => {
  resetDemoRateLimiterForTests();
  setDemoLlmForTests(mockLlm({ completion: '{}', fail: true }));

  try {
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/demo/judge',
      headers: { 'x-forwarded-for': '203.0.113.77' },
      payload: { handle: 'demo', message: STRONG_MESSAGE },
    });
    assert.equal(res.statusCode, 503);
    const body = res.json() as { error?: string; decision?: string };
    assert.equal(body.error, DEMO_BUSY_ERROR);
    assert.equal(body.decision, undefined);
    await app.close();
  } finally {
    setDemoLlmForTests(undefined);
    resetDemoRateLimiterForTests();
  }
});
