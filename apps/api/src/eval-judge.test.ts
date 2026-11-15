import assert from 'node:assert/strict';
import { test } from 'node:test';

import { JUDGE_EVAL_CASES } from './eval-judge.cases.ts';
import { runJudgeEval } from './eval-judge.ts';
import { defaultCoachingTip } from './judge.ts';
import type { Llm, LlmProvider } from './llm.ts';

test('judge eval suite covers verdicts plus rewrite/reason polish cases', () => {
  assert.ok(JUDGE_EVAL_CASES.length >= 18);
  assert.ok(JUDGE_EVAL_CASES.filter((c) => c.expected === 'accept').length >= 3);
  assert.ok(JUDGE_EVAL_CASES.filter((c) => c.expected === 'reject').length >= 3);
  assert.ok(JUDGE_EVAL_CASES.filter((c) => c.expected === 'spam').length >= 3);
  assert.ok(JUDGE_EVAL_CASES.some((c) => c.checks?.rewriteIsCoachingTip));
  assert.ok(JUDGE_EVAL_CASES.some((c) => c.checks?.reasonPersonalVoice));
  assert.ok(JUDGE_EVAL_CASES.some((c) => c.checks?.rewriteNoPlaceholders));
  assert.ok(JUDGE_EVAL_CASES.some((c) => c.id.startsWith('reject-borderline-')));
  assert.ok(JUDGE_EVAL_CASES.some((c) => c.id === 'reject-offprofile-investor-northzone'));
});

test('runJudgeEval scores mock LLM labels, bands, and polish checks', async () => {
  const byId = new Map(JUDGE_EVAL_CASES.map((c) => [c.id, c]));

  const provider: LlmProvider = {
    name: 'mock',
    async complete() {
      return '{}';
    },
    async embed() {
      return [0.5, 0.5, 0.1];
    },
  };

  const llm: Llm = {
    providerName: 'mock',
    chatModel: 'mock-model',
    provider,
    async complete(messages) {
      const blob = messages.map((m) => m.content).join('\n');
      // Prefer the longest full-message match so system-prompt few-shots don't steal the label.
      const match = [...byId.values()]
        .filter((c) => blob.includes(c.message))
        .sort((a, b) => b.message.length - a.message.length)[0];
      const decision = match?.expected ?? 'reject';
      const score = decision === 'spam' ? 10 : decision === 'reject' ? 40 : 85;
      const wantsCoaching = Boolean(match?.checks?.rewriteIsCoachingTip);
      return JSON.stringify({
        score,
        decision,
        reason_public:
          decision === 'accept'
            ? "I'll pass this to Sam — clear peer ask."
            : decision === 'spam'
              ? "I won't pass this spam along to Sam."
              : "Sam isn't open to this ask right now.",
        reason_private: 'eval',
        suggested_rewrite:
          decision === 'reject'
            ? wantsCoaching
              ? defaultCoachingTip('Sam')
              : 'Hi Sam — I’m a student exploring startups and wanted a concrete written question.'
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
