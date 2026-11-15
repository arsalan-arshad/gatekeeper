import {
  enforceDecision,
  sanitizePublicReason,
  type JudgeDecision,
  type JudgeResult,
} from './judge.js';
import { getDemoProfile, type DemoProfile } from './demo-profiles.js';

function countHits(haystack: string, needles: string[]): number {
  let hits = 0;
  for (const needle of needles) {
    if (haystack.includes(needle.toLowerCase())) hits += 1;
  }
  return hits;
}

/**
 * Deterministic demo judge used by the landing "Try it now" flow.
 * Same public result shape as judgeRequest — no LLM spend, works offline.
 */
export function demoJudgeRequest(input: {
  handle: string;
  message: string;
  senderName?: string;
}): JudgeResult | { error: string } {
  const profile = getDemoProfile(input.handle);
  if (!profile) {
    return { error: 'Unknown demo profile' };
  }

  const message = input.message.trim();
  if (!message) {
    return { error: 'Message is required' };
  }

  return scoreAgainstProfile(profile, message);
}

function scoreAgainstProfile(profile: DemoProfile, message: string): JudgeResult {
  const lower = message.toLowerCase();
  const spamHits = countHits(lower, profile.spamSignals);
  const acceptHits = countHits(lower, profile.acceptSignals);
  const rejectHits = countHits(lower, profile.rejectSignals);
  const lengthBonus =
    message.length >= 80 && message.length <= 600 ? 8 : message.length < 40 ? -12 : 0;

  let score = 42 + acceptHits * 14 - rejectHits * 10 - spamHits * 28 + lengthBonus;
  score = Math.min(100, Math.max(0, Math.round(score)));

  const dealBreakerHit = spamHits > 0;
  let llmDecision: JudgeDecision = 'reject';
  if (dealBreakerHit) {
    llmDecision = 'spam';
    score = Math.min(score, 25);
  } else if (acceptHits >= 2 && score >= profile.minRelevance) {
    llmDecision = 'accept';
  } else if (acceptHits >= 1 && rejectHits === 0 && score >= profile.minRelevance - 5) {
    llmDecision = score >= profile.minRelevance ? 'accept' : 'reject';
  }

  const decision = enforceDecision({
    score,
    decision: llmDecision,
    dealBreakerHit,
    minRelevance: profile.minRelevance,
  });

  const reasonPublic = sanitizePublicReason(
    buildPublicReason(decision, acceptHits),
    profile.ruleText,
  );
  const suggested = decision === 'accept' ? null : buildSuggestedRewrite(profile, decision);

  return {
    score,
    decision,
    reason_public: reasonPublic,
    reason_private: `demo; accept=${acceptHits}; reject=${rejectHits}; spam=${spamHits}`,
    suggested_rewrite: suggested,
    similarity: Math.min(1, Math.max(0, 0.35 + acceptHits * 0.12 - spamHits * 0.2)),
  };
}

function buildPublicReason(decision: JudgeDecision, acceptHits: number): string {
  if (decision === 'accept') {
    return acceptHits >= 2
      ? 'Clear fit with a concrete ask — this would be forwarded for double opt-in.'
      : 'Relevant enough to pass the gate for a double-opt-in intro.';
  }
  if (decision === 'spam') {
    return 'This looks like a deal-breaker pitch. Gatekeeper blocked it as spam.';
  }
  return 'Not a strong fit right now. A sharper, more specific ask would help.';
}

function buildSuggestedRewrite(profile: DemoProfile, decision: JudgeDecision): string {
  if (decision === 'spam') {
    return `Hi ${profile.name.split(' ')[0]} — I’m reaching out about a specific peer topic aligned with what you’re open to (not a sales pitch). Here’s the one concrete ask: …`;
  }
  return `Hi ${profile.name.split(' ')[0]} — I’m [role] working on [specific project]. I’d love a short intro because [concrete overlap with your work]. One ask: [clear CTA]. Happy to share a 3-bullet context note first.`;
}
