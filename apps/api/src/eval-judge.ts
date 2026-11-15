/**
 * Live judge quality eval against @demo.
 *
 * Usage: pnpm eval:judge
 * Requires GEMINI_API_KEY and/or GROQ_API_KEY.
 * Exits non-zero when accuracy < 90%.
 */

import { pathToFileURL } from 'node:url';

import { DEMO_ACCEPT_THRESHOLD, demoJudgeRequest } from './demo-judge.js';
import { JUDGE_EVAL_CASES, type JudgeEvalCase } from './eval-judge.cases.js';
import {
  decisionMatchesScore,
  hasCompanyVoice,
  hasRewritePlaceholders,
  isCoachingTip,
} from './judge.js';
import { createLlm } from './llm.js';

const ACCURACY_THRESHOLD = 0.9;

export type EvalRow = {
  id: string;
  expected: string;
  actual: string | null;
  score: number | null;
  ok: boolean;
  error?: string;
  bandOk: boolean;
};

function evaluateChecks(
  testCase: JudgeEvalCase,
  result: {
    decision: string;
    reason_public: string;
    suggested_rewrite: string | null;
  },
): string | undefined {
  const checks = testCase.checks;
  if (!checks) return undefined;

  if (checks.rewriteNoPlaceholders) {
    const rewrite = result.suggested_rewrite ?? '';
    if (rewrite && hasRewritePlaceholders(rewrite)) {
      return `rewrite has placeholders: ${rewrite.slice(0, 80)}`;
    }
  }

  if (checks.rewriteIsCoachingTip) {
    const rewrite = result.suggested_rewrite ?? '';
    if (!rewrite || !isCoachingTip(rewrite)) {
      return `expected coaching-tip rewrite, got: ${rewrite.slice(0, 100) || 'null'}`;
    }
  }

  if (checks.reasonPersonalVoice) {
    const reason = result.reason_public ?? '';
    if (hasCompanyVoice(reason)) {
      return `reason uses company voice: ${reason.slice(0, 100)}`;
    }
    // Prefer first-person / owner-named personal gatekeeper phrasing.
    const personal =
      /\b(I'|I |Sam|I'll|I will|I won't|I cannot|I can't)\b/i.test(reason) ||
      /\bSam\b/.test(reason);
    if (!personal) {
      return `reason lacks personal gatekeeper voice: ${reason.slice(0, 100)}`;
    }
  }

  return undefined;
}

export async function runJudgeEval(options?: {
  cases?: typeof JUDGE_EVAL_CASES;
  llm?: ReturnType<typeof createLlm>;
}): Promise<{ accuracy: number; passed: number; total: number; rows: EvalRow[] }> {
  const cases = options?.cases ?? JUDGE_EVAL_CASES;
  const llm = options?.llm ?? createLlm({ maxRetries: 0, timeoutMs: 20_000 });

  const rows: EvalRow[] = [];

  for (const testCase of cases) {
    try {
      const result = await demoJudgeRequest(
        {
          handle: 'demo',
          message: testCase.message,
          senderName: testCase.senderName,
        },
        llm,
      );

      if ('error' in result) {
        rows.push({
          id: testCase.id,
          expected: testCase.expected,
          actual: null,
          score: null,
          ok: false,
          bandOk: false,
          error: result.error,
        });
        continue;
      }

      const labelOk = result.decision === testCase.expected;
      const bandOk = decisionMatchesScore(result.decision, result.score);
      const checkError = evaluateChecks(testCase, result);
      const ok = labelOk && bandOk && !checkError;
      rows.push({
        id: testCase.id,
        expected: testCase.expected,
        actual: result.decision,
        score: result.score,
        ok,
        bandOk,
        error: checkError
          ? checkError
          : bandOk
            ? labelOk
              ? undefined
              : `expected=${testCase.expected} actual=${result.decision}`
            : `score ${result.score} outside ${result.decision} band`,
      });
    } catch (error) {
      rows.push({
        id: testCase.id,
        expected: testCase.expected,
        actual: null,
        score: null,
        ok: false,
        bandOk: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const passed = rows.filter((row) => row.ok).length;
  const total = rows.length;
  const accuracy = total === 0 ? 0 : passed / total;
  return { accuracy, passed, total, rows };
}

async function main(): Promise<void> {
  const hasKey = Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GROQ_API_KEY?.trim());
  if (!hasKey) {
    console.error('eval:judge requires GEMINI_API_KEY and/or GROQ_API_KEY');
    process.exit(2);
  }

  console.log(
    `Running judge eval: ${JUDGE_EVAL_CASES.length} cases vs @demo (accept≥${DEMO_ACCEPT_THRESHOLD})`,
  );

  const { accuracy, passed, total, rows } = await runJudgeEval();

  for (const row of rows) {
    const mark = row.ok ? 'PASS' : 'FAIL';
    const detail = row.error
      ? row.error
      : `expected=${row.expected} actual=${row.actual} score=${row.score}`;
    console.log(`${mark}  ${row.id}  ${detail}`);
  }

  const pct = (accuracy * 100).toFixed(1);
  console.log(
    `\nAccuracy: ${passed}/${total} (${pct}%) — threshold ${(ACCURACY_THRESHOLD * 100).toFixed(0)}%`,
  );

  if (accuracy < ACCURACY_THRESHOLD) {
    console.error('Judge eval failed accuracy gate');
    process.exit(1);
  }

  console.log('Judge eval passed');
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
