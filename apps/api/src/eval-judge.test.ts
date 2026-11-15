import assert from 'node:assert/strict';
import { test } from 'node:test';

import { JUDGE_EVAL_CASES } from './eval-judge.cases.ts';
import { runJudgeEval } from './eval-judge.ts';
import type { Llm, LlmProvider } from './llm.ts';

test('judge eval suite has ~12 labeled cases across verdicts', () => {
  assert.ok(JUDGE_EVAL_CASES.length >= 12);
  assert.ok(JUDGE_EVAL_CASES.filter((c) => c.expected === 'accept').length >= 3);
  assert.ok(JUDGE_EVAL_CASES.filter((c) => c.expected === 'reject').length >= 3);
  assert.ok(JUDGE_EVAL_CASES.filter((c) => c.expected === 'spam').length >= 3);
});

test('runJudgeEval scores mock LLM labels and enforces band match', async () => {
  const byId = new Map(JUDGE_EVAL_CASES.map((c) => [c.id, c]));

  const provider: LlmProvider = {
    name: 'mock',
    async complete(_messages) {
      // Pull expected label from the user prompt message text via last case run order —
      // demoJudgeRequest embeds the message; map by scanning known messages.
      return JSON.stringify({
        score: 88,
        decision: 'accept',
        reason_public: 'Clear peer ask.',
        reason_private: 'ok',
        suggested_rewrite: null,
        deal_breaker_hit: false,
      });
    },
    async embed() {
      return [0.5, 0.5, 0.1];
    },
  };

  // Per-case mock: return the expected verdict with a matching score band.
  const llm: Llm = {
    providerName: 'mock',
    provider,
    async complete(messages) {
      const blob = messages.map((m) => m.content).join('\n');
      const match = [...byId.values()].find((c) => blob.includes(c.message.slice(0, 48)));
      const decision = match?.expected ?? 'reject';
      const score = decision === 'spam' ? 10 : decision === 'reject' ? 40 : 85;
      return JSON.stringify({
        score,
        decision,
        reason_public: 'Labeled fixture response.',
        reason_private: 'eval',
        suggested_rewrite:
          decision === 'reject'
            ? 'Hi Sam — I’m a peer founder shipping usage-based billing and wanted a short intro.'
            : null,
        deal_breaker_hit: decision === 'spam',
      });
    },
    embed: () => provider.embed('x'),
    clearEmbeddingCache() {},
    getDailyUsage() {
      return 0;
    },
    async healthCheck() {
      return [{ provider: 'gemini', ok: true, model: 'mock', error: null }];
    },
  };

  const result = await runJudgeEval({ cases: JUDGE_EVAL_CASES, llm });
  assert.equal(result.total, JUDGE_EVAL_CASES.length);
  assert.equal(result.passed, JUDGE_EVAL_CASES.length);
  assert.ok(result.accuracy >= 0.9);
});
