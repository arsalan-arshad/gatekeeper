import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEMO_ACCEPT_THRESHOLD, DEMO_BUSY_ERROR, demoJudgeRequest } from './demo-judge.js';
import { buildServer } from './index.js';
import type { Llm, LlmProvider } from './llm.js';
import { resetDemoRateLimiterForTests, setDemoLlmForTests } from './routes/demo.js';

const STRONG_MESSAGE =
  'Hey Sam — I’m a founder shipping a usage-based billing SaaS for indie tools. Would love a short peer intro to compare Stripe edge cases and founder-led sales.';

const SPAM_MESSAGE = 'Hot crypto NFT token launch — guaranteed leads for your SaaS!!';

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
      suggested_rewrite:
        'Hi Sam — I’m a peer founder with a specific billing question, not a token pitch…',
      deal_breaker_hit: true,
    }),
  });

  const result = await demoJudgeRequest({ handle: 'demo', message: SPAM_MESSAGE }, llm);
  assert.ok(!('error' in result));
  if ('error' in result) return;
  assert.equal(result.decision, 'spam');
  assert.ok(result.suggested_rewrite);
  assert.match(result.reason_public, /crypto|nft|spam|deal-breaker/i);
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
      suggested_rewrite: 'Rewrite without crypto hype…',
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

test('POST /v1/demo/judge is IP rate limited (5/day) and omits private reasons', async () => {
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

    // Cached replay does not consume more of the daily budget.
    const cached = await app.inject({
      method: 'POST',
      url: '/v1/demo/judge',
      headers: { 'x-forwarded-for': '203.0.113.50' },
      payload: { handle: 'demo', message: STRONG_MESSAGE },
    });
    assert.equal(cached.statusCode, 200);

    // 4 more unique messages → daily cap of 5.
    for (let i = 0; i < 4; i += 1) {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/demo/judge',
        headers: { 'x-forwarded-for': '203.0.113.50' },
        payload: { handle: 'demo', message: `probe ${i} founder saas billing typescript peer` },
      });
      assert.equal(res.statusCode, 200);
    }

    const limited = await app.inject({
      method: 'POST',
      url: '/v1/demo/judge',
      headers: { 'x-forwarded-for': '203.0.113.50' },
      payload: { handle: 'demo', message: 'another founder saas billing note' },
    });
    assert.equal(limited.statusCode, 429);

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
