import type { Llm } from './llm.js';

export type JudgeDecision = 'accept' | 'reject' | 'spam';

export type JudgeResult = {
  score: number;
  decision: JudgeDecision;
  reason_public: string;
  reason_private: string;
  suggested_rewrite: string | null;
  /** Cosine similarity 0–1 between request and profile embeddings. */
  similarity: number;
};

export type JudgeTarget = {
  profileEmbedding: number[] | null;
  ruleText: string;
  minRelevance: number;
  name?: string | null;
  wantsText?: string | null;
  neverText?: string | null;
};

export type JudgeRequestInput = {
  message: string;
  senderName: string;
  senderType: 'human' | 'agent';
  senderContact?: string;
  target: JudgeTarget;
  /** Counts toward the target user's LLM daily budget when set. */
  userId?: string;
};

type LlmJudgePayload = {
  score?: unknown;
  decision?: unknown;
  reason_public?: unknown;
  reason_private?: unknown;
  suggested_rewrite?: unknown;
  deal_breaker_hit?: unknown;
};

const DECISIONS = new Set<JudgeDecision>(['accept', 'reject', 'spam']);

/** Cosine similarity in [0, 1] after clamping negatives to 0. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }

  if (normA === 0 || normB === 0) return 0;
  const raw = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  if (!Number.isFinite(raw)) return 0;
  return Math.min(1, Math.max(0, raw));
}

function clampScore(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function asDecision(value: unknown): JudgeDecision | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase() as JudgeDecision;
  return DECISIONS.has(normalized) ? normalized : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

/**
 * Strip private rule text from a public-facing reason.
 * Never quote gate_rules (or long shared substrings) back to senders.
 */
export function sanitizePublicReason(reason: string, privateRuleText: string): string {
  let cleaned = reason.trim();
  if (!cleaned) {
    return 'This request was not a strong fit right now.';
  }

  const chunks = privateRuleText
    .split(/[\n.]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 24);

  for (const chunk of chunks) {
    if (cleaned.toLowerCase().includes(chunk.toLowerCase())) {
      cleaned = cleaned.replace(new RegExp(escapeRegExp(chunk), 'ig'), '[redacted]');
    }
  }

  if (
    /gate[_\s-]?rules?|private rules?|deal-?breakers?:|min[_ ]relevance/i.test(cleaned) ||
    cleaned.includes('[redacted]')
  ) {
    return 'This request was not a strong fit for what they are open to right now.';
  }

  return cleaned;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildJudgePrompt(input: JudgeRequestInput, similarity: number): string {
  return JSON.stringify(
    {
      task: 'Judge an inbound intro request against the receiver private gate rules.',
      similarity_0_to_1: Number(similarity.toFixed(4)),
      min_relevance: input.target.minRelevance,
      receiver: {
        name: input.target.name ?? null,
        wants: input.target.wantsText ?? null,
        never: input.target.neverText ?? null,
        gate_rules_private: input.target.ruleText,
      },
      request: {
        sender_type: input.senderType,
        sender_name: input.senderName,
        message: input.message,
      },
      output_schema: {
        score: 'integer 0-100',
        decision: 'accept | reject | spam',
        reason_public:
          'short explanation safe to show the sender — NEVER quote or paraphrase private gate rules',
        reason_private: 'internal notes; may reference rules',
        suggested_rewrite: 'nullable improved message for reject/spam, else null',
        deal_breaker_hit: 'boolean',
      },
    },
    null,
    2,
  );
}

/** Accept only when score >= min_relevance and no deal-breaker was hit. */
export function enforceDecision(options: {
  score: number;
  decision: JudgeDecision;
  dealBreakerHit: boolean;
  minRelevance: number;
}): JudgeDecision {
  const { score, decision, dealBreakerHit, minRelevance } = options;

  if (dealBreakerHit) {
    return 'spam';
  }

  if (decision === 'accept') {
    return score >= minRelevance ? 'accept' : 'reject';
  }

  if (decision === 'spam') return 'spam';
  return 'reject';
}

/**
 * Core Gatekeeper judge: embed → similarity → LLM JSON → enforce accept policy.
 * Private gate rules must never appear in `reason_public`.
 */
export async function judgeRequest(input: JudgeRequestInput, llm: Llm): Promise<JudgeResult> {
  const embedText = [`Sender: ${input.senderName} (${input.senderType})`, input.message].join('\n');

  // Embeddings are best-effort: on failure, skip similarity and judge LLM-only (no 503).
  let similarity = 0.5;
  try {
    const requestEmbedding = await llm.embed(embedText, { userId: input.userId });
    if (input.target.profileEmbedding) {
      similarity = cosineSimilarity(requestEmbedding, input.target.profileEmbedding);
    }
  } catch {
    similarity = 0.5;
  }

  const raw = await llm.complete(
    [
      {
        role: 'system',
        content:
          'You are Gatekeeper, an AI principal. Return JSON only. Never reveal or quote private gate rules in reason_public. Prefer spam for scams/crypto cold pitches/clear deal-breakers; reject for weak fit; accept only for strong relevant intros.',
      },
      {
        role: 'user',
        content: buildJudgePrompt(input, similarity),
      },
    ],
    { json: true, userId: input.userId },
  );

  let parsed: LlmJudgePayload = {};
  try {
    parsed = JSON.parse(raw) as LlmJudgePayload;
  } catch {
    parsed = {};
  }

  const score = clampScore(parsed.score);
  const dealBreakerHit = Boolean(parsed.deal_breaker_hit);
  const llmDecision = asDecision(parsed.decision) ?? (dealBreakerHit ? 'spam' : 'reject');
  const decision = enforceDecision({
    score,
    decision: llmDecision,
    dealBreakerHit,
    minRelevance: input.target.minRelevance,
  });

  const reasonPrivate =
    asString(parsed.reason_private) ||
    `score=${score}; similarity=${similarity.toFixed(3)}; deal_breaker=${dealBreakerHit}`;

  const defaultPublic =
    decision === 'accept'
      ? 'This looks like a relevant intro.'
      : 'This request was not a strong fit right now.';

  const reasonPublic = sanitizePublicReason(
    asString(parsed.reason_public, defaultPublic),
    input.target.ruleText,
  );

  const suggested = decision === 'accept' ? null : asString(parsed.suggested_rewrite) || null;

  return {
    score,
    decision,
    reason_public: reasonPublic,
    reason_private: reasonPrivate,
    suggested_rewrite: suggested,
    similarity,
  };
}
