import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  clampScoreToDecision,
  cosineSimilarity,
  decisionMatchesScore,
  enforceDecision,
  hasRewritePlaceholders,
  judgeRequest,
  llmJudgePayloadSchema,
  sanitizePublicReason,
} from './judge.ts';
import { JUDGE_SAMPLES, SAMPLE_TARGET } from './judge.samples.ts';
import type { Llm, LlmProvider } from './llm.ts';

function mockLlm(options: {
  embedding: number[];
  completion: string | string[];
}): Llm & { provider: LlmProvider; calls: number } {
  let calls = 0;
  const completions = Array.isArray(options.completion) ? options.completion : [options.completion];

  const provider: LlmProvider = {
    name: 'mock',
    async complete() {
      const idx = Math.min(calls, completions.length - 1);
      calls += 1;
      return completions[idx]!;
    },
    async embed() {
      return options.embedding;
    },
  };

  return {
    providerName: 'mock',
    provider,
    get calls() {
      return calls;
    },
    complete: (messages, completeOptions) => provider.complete(messages, completeOptions),
    embed: (text) => provider.embed(text),
    clearEmbeddingCache() {},
    getDailyUsage() {
      return 0;
    },
    async healthCheck() {
      return [{ provider: 'gemini', ok: true, model: 'mock', error: null }];
    },
  };
}

test('cosineSimilarity is 1 for identical vectors and 0 for orthogonal', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.ok(cosineSimilarity([1, 0], [0.8, 0.2]) > 0.9);
});

test('enforceDecision blocks accept below min_relevance or with deal-breakers', () => {
  assert.equal(
    enforceDecision({ score: 90, decision: 'accept', dealBreakerHit: false, minRelevance: 70 }),
    'accept',
  );
  assert.equal(
    enforceDecision({ score: 60, decision: 'accept', dealBreakerHit: false, minRelevance: 70 }),
    'reject',
  );
  assert.equal(
    enforceDecision({ score: 95, decision: 'accept', dealBreakerHit: true, minRelevance: 70 }),
    'spam',
  );
});

test('score bands match verdicts and placeholders are detected', () => {
  assert.equal(decisionMatchesScore('spam', 12), true);
  assert.equal(decisionMatchesScore('spam', 40), false);
  assert.equal(decisionMatchesScore('reject', 40), true);
  assert.equal(decisionMatchesScore('accept', 60), true);
  assert.equal(clampScoreToDecision('reject', 88), 59);
  assert.equal(hasRewritePlaceholders('Hi from <YourCompany>'), true);
  assert.equal(hasRewritePlaceholders('Looking for a [role] intro'), true);
  assert.equal(hasRewritePlaceholders('Hi — I ship billing tools for indie SaaS.'), false);

  const bad = llmJudgePayloadSchema.safeParse({
    score: 80,
    decision: 'spam',
    reason_public: 'Nope.',
    reason_private: 'x',
    suggested_rewrite: 'Hi from <YourCompany>',
    deal_breaker_hit: true,
  });
  assert.equal(bad.success, false);
});

test('judgeRequest retries once when score/verdict disagree then accepts correction', async () => {
  const llm = mockLlm({
    embedding: [1, 0, 0, 0],
    completion: [
      JSON.stringify({
        score: 80,
        decision: 'spam',
        reason_public: 'Wrong band.',
        reason_private: 'bad',
        suggested_rewrite: 'Use <YourCompany>',
        deal_breaker_hit: false,
      }),
      JSON.stringify({
        score: 34,
        decision: 'reject',
        reason_public: 'A vague ask is not a strong fit right now.',
        reason_private: 'corrected',
        suggested_rewrite:
          'Hi Ada — I run a B2B invoicing SaaS and wanted a short intro about billing edge cases.',
        deal_breaker_hit: false,
      }),
    ],
  });

  const result = await judgeRequest(
    {
      message: 'We should sync sometime?',
      senderName: 'Vague',
      senderType: 'human',
      target: SAMPLE_TARGET,
    },
    llm,
  );

  assert.equal(llm.calls, 2);
  assert.equal(result.decision, 'reject');
  assert.ok(result.score >= 26 && result.score <= 59);
  assert.ok(result.suggested_rewrite);
  assert.equal(hasRewritePlaceholders(result.suggested_rewrite!), false);
});

test('judgeRequest drops rewrite for spam even if the model invents one', async () => {
  const llm = mockLlm({
    embedding: [0, 0, 1, 0],
    completion: JSON.stringify({
      score: 9,
      decision: 'spam',
      reason_public: 'Unsolicited crypto promotion is blocked.',
      reason_private: 'crypto',
      suggested_rewrite: 'Rewrite without hype',
      deal_breaker_hit: true,
    }),
  });

  const result = await judgeRequest(
    {
      message: 'Hot NFT token launch for guaranteed leads!!!',
      senderName: 'Moon',
      senderType: 'human',
      target: SAMPLE_TARGET,
    },
    llm,
  );

  // First response fails zod (spam + rewrite); retry gets same mock → coerce path.
  assert.equal(result.decision, 'spam');
  assert.equal(result.suggested_rewrite, null);
  assert.ok(result.score <= 25);
});

test('sanitizePublicReason never echoes private gate rules', () => {
  const leaked = sanitizePublicReason(
    'Rejected because: Deal-breakers: cold spam and asking me to promote strangers without context.',
    SAMPLE_TARGET.ruleText,
  );
  assert.doesNotMatch(leaked, /Deal-breakers:/i);
  assert.doesNotMatch(leaked, /cold spam and asking me to promote/i);
  assert.match(leaked, /not a strong fit/i);
});

test('sample suite has 5 good and 5 bad fixtures', () => {
  assert.equal(JUDGE_SAMPLES.length, 10);
  assert.equal(JUDGE_SAMPLES.filter((s) => s.kind === 'good').length, 5);
  assert.equal(JUDGE_SAMPLES.filter((s) => s.kind === 'bad').length, 5);
});

for (const sample of JUDGE_SAMPLES) {
  test(`judgeRequest sample: ${sample.id}`, async () => {
    const llm = mockLlm({
      embedding: sample.requestEmbedding,
      completion: JSON.stringify(sample.llm),
    });

    const result = await judgeRequest(
      {
        message: sample.message,
        senderName: sample.senderName,
        senderType: sample.senderType,
        target: SAMPLE_TARGET,
        userId: 'sample-user',
      },
      llm,
    );

    assert.equal(result.decision, sample.expectedDecision);
    assert.equal(result.score, sample.llm.score);
    assert.ok(result.similarity >= 0 && result.similarity <= 1);

    // Privacy: never expose private rules on the public reason.
    assert.doesNotMatch(result.reason_public, /gate_rules/i);
    assert.doesNotMatch(result.reason_public, /private rules?/i);
    assert.doesNotMatch(result.reason_public, /Deal-breakers:/i);
    assert.doesNotMatch(result.reason_public, /Accept intros that match:/i);
    assert.doesNotMatch(result.reason_public, /Preferred intro format:/i);

    if (sample.expectedDecision === 'accept') {
      assert.equal(result.suggested_rewrite, null);
      assert.ok(result.score >= SAMPLE_TARGET.minRelevance);
    } else {
      assert.notEqual(result.decision, 'accept');
    }
  });
}
