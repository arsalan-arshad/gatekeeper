import { judgeRequest, sanitizePublicReason, type JudgeResult } from './judge.js';
import { getDemoProfile } from './demo-profiles.js';
import type { Llm } from './llm.js';

/** Demo accept threshold — slightly lower than typical user min_relevance for landing UX. */
export const DEMO_ACCEPT_THRESHOLD = 60;

export const DEMO_BUSY_ERROR = 'AI busy, try again';

export type DemoJudgeOk = JudgeResult & { handle: string };

export type DemoJudgeFailure = {
  error: string;
  /** True when the LLM/provider failed — never invent a verdict. */
  busy: true;
};

export type DemoJudgeOutcome = DemoJudgeOk | DemoJudgeFailure | { error: string };

function isBusyFailure(value: DemoJudgeOutcome): value is DemoJudgeFailure {
  return 'busy' in value && value.busy === true;
}

/**
 * Landing / @demo judge — always calls `judgeRequest` via the swappable LLM.
 * No keyword fallback. On provider failure, returns a busy error (no fake verdict).
 */
export async function demoJudgeRequest(
  input: {
    handle: string;
    message: string;
    senderName?: string;
  },
  llm: Llm,
  log?: { error: (obj: unknown, msg?: string) => void },
): Promise<DemoJudgeOutcome> {
  const profile = getDemoProfile(input.handle);
  if (!profile) {
    return { error: 'Unknown demo profile' };
  }

  const message = input.message.trim();
  if (!message) {
    return { error: 'Message is required' };
  }

  const senderName = input.senderName?.trim() || 'Demo visitor';

  try {
    const result = await judgeRequest(
      {
        message,
        senderName,
        senderType: 'human',
        target: {
          profileEmbedding: null,
          ruleText: profile.ruleText,
          minRelevance: DEMO_ACCEPT_THRESHOLD,
          name: profile.name,
          wantsText: profile.wantsText,
          neverText: profile.neverText,
        },
      },
      llm,
    );

    // Ensure public reason is request-specific enough; sanitize still applies.
    const reasonPublic = sanitizePublicReason(result.reason_public, profile.ruleText);

    return {
      ...result,
      reason_public: reasonPublic,
      handle: profile.handle,
    };
  } catch (error) {
    log?.error({ err: error, handle: profile.handle }, 'demoJudgeRequest LLM failed');
    return { error: DEMO_BUSY_ERROR, busy: true };
  }
}

export { isBusyFailure };
