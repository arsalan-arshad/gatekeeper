import type { JudgeDecision } from './judge.js';
import { SCORE_BANDS } from './judge.js';

/**
 * Infer the AI verdict from a score using the canonical bands.
 * Used to repair rows where owner override historically overwrote `decision`.
 */
export function decisionFromScore(score: number): JudgeDecision {
  const n = Math.round(score);
  if (n <= SCORE_BANDS.spam.max) return 'spam';
  if (n <= SCORE_BANDS.reject.max) return 'reject';
  return 'accept';
}

/**
 * True when stored AI decision matches the score band (or score is missing).
 */
export function aiVerdictMatchesScore(
  decision: JudgeDecision | null | undefined,
  score: number | null | undefined,
): boolean {
  if (score == null || decision == null) return true;
  const expected = decisionFromScore(score);
  return decision === expected;
}

/**
 * Repair plan for a corrupted AI verdict. Returns null when no change needed.
 */
export function repairAiVerdict(input: {
  decision: JudgeDecision | null | undefined;
  aiScore: number | null | undefined;
}): { decision: JudgeDecision } | null {
  if (input.aiScore == null || input.decision == null) return null;
  if (aiVerdictMatchesScore(input.decision, input.aiScore)) return null;
  return { decision: decisionFromScore(input.aiScore) };
}
