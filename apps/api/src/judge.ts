import { z } from 'zod';

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

/** Score bands that must match the verdict. */
export const SCORE_BANDS = {
  spam: { min: 0, max: 25 },
  reject: { min: 26, max: 59 },
  accept: { min: 60, max: 100 },
} as const;

const DECISIONS = new Set<JudgeDecision>(['accept', 'reject', 'spam']);

const PLACEHOLDER_RE =
  /<[^>\s][^>]*>|\[[^\]]+\]|\{[A-Za-z][^}]*\}|\bYourCompany\b|\bYourName\b|\bTBD\b|\bTODO\b/i;

export const llmJudgePayloadSchema = z
  .object({
    score: z.number().finite(),
    decision: z.enum(['accept', 'reject', 'spam']),
    reason_public: z.string(),
    reason_private: z.string().optional().default(''),
    suggested_rewrite: z.union([z.string(), z.null()]).optional().default(null),
    deal_breaker_hit: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    const score = Math.round(data.score);
    if (score < 0 || score > 100) {
      ctx.addIssue({
        code: 'custom',
        message: 'score must be an integer 0-100',
        path: ['score'],
      });
    }

    const band = SCORE_BANDS[data.decision];
    if (score < band.min || score > band.max) {
      ctx.addIssue({
        code: 'custom',
        message: `${data.decision} requires score ${band.min}-${band.max}, got ${score}`,
        path: ['score'],
      });
    }

    if (data.decision === 'spam' && data.suggested_rewrite) {
      ctx.addIssue({
        code: 'custom',
        message: 'spam must return suggested_rewrite: null',
        path: ['suggested_rewrite'],
      });
    }

    if (data.decision === 'accept' && data.suggested_rewrite) {
      ctx.addIssue({
        code: 'custom',
        message: 'accept must return suggested_rewrite: null',
        path: ['suggested_rewrite'],
      });
    }

    if (data.suggested_rewrite && hasRewritePlaceholders(data.suggested_rewrite)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'suggested_rewrite must not invent companies or use placeholders like <YourCompany> or [role]',
        path: ['suggested_rewrite'],
      });
    }
  });

export type LlmJudgePayload = z.infer<typeof llmJudgePayloadSchema>;

/** True when rewrite text contains banned placeholders. */
export function hasRewritePlaceholders(text: string): boolean {
  return PLACEHOLDER_RE.test(text);
}

/** Whether score sits in the band required by the verdict. */
export function decisionMatchesScore(decision: JudgeDecision, score: number): boolean {
  const band = SCORE_BANDS[decision];
  return score >= band.min && score <= band.max;
}

/** Clamp score into the band for a verdict. */
export function clampScoreToDecision(decision: JudgeDecision, score: number): number {
  const band = SCORE_BANDS[decision];
  const n = Number.isFinite(score) ? Math.round(score) : band.min;
  return Math.min(band.max, Math.max(band.min, n));
}

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

/**
 * System prompt with strict verdict definitions and few-shot examples.
 * A real person with a clear honest ask must never be SPAM.
 */
export const JUDGE_SYSTEM_PROMPT = `You are Gatekeeper, an AI principal that judges inbound intro requests.
Return JSON only. Never reveal or quote private gate rules in reason_public.

## Verdict definitions (STRICT — use only these meanings)

SPAM (score 0–25) = ONLY mass/templated pitches, scams, crypto/NFT promos, guaranteed-leads promises, or unsolicited sales of services. Nothing else is spam.
REJECT (score 26–59) = A genuine human request that is vague or does not fit the owner's stated wants (e.g. "pick your brain over coffee", customers when the owner wants peers).
ACCEPT (score 60–100) = Specific, honest, matches the owner's stated wants, and score >= 60.

Critical: a real person with a clear honest ask must NEVER be SPAM — use REJECT if it is a weak fit, ACCEPT if it matches.

## Score bands (must match verdict)
- SPAM → 0–25
- REJECT → 26–59
- ACCEPT → 60–100

## suggested_rewrite
Improve the SENDER's own message. Keep their identity and goal.
Never invent a company. Never copy the owner's profile into the rewrite.
Never output placeholders like <YourCompany>, [role], {Name}, or similar.
If verdict is SPAM: suggested_rewrite must be null.
If verdict is ACCEPT: suggested_rewrite must be null.
If verdict is REJECT: optional improved message the sender could send instead.

## reason_public
Exactly one grammatically correct polite sentence, written as the owner's gatekeeper speaking to the sender. Never quote private rules.

## Few-shot examples

Example 1 — SPAM:
Message: "Hot crypto NFT token launch — promote to your audience for guaranteed leads!!"
→ {"score":8,"decision":"spam","reason_public":"Unsolicited crypto and NFT promotion is not something I forward.","reason_private":"crypto/NFT blast","suggested_rewrite":null,"deal_breaker_hit":true}

Example 2 — SPAM:
Message: "We 10x any SaaS with guaranteed leads — book a free SEO agency audit today!!!"
→ {"score":12,"decision":"spam","reason_public":"Mass sales outreach for agency services is blocked as spam.","reason_private":"unsolicited agency sales","suggested_rewrite":null,"deal_breaker_hit":true}

Example 3 — REJECT:
Message: "Quick sync sometime? Would love to pick your brain over coffee — no agenda yet."
→ {"score":34,"decision":"reject","reason_public":"A vague coffee chat without a written ask is not a strong fit right now.","reason_private":"vague; no concrete ask","suggested_rewrite":"Hi — I'm Alex, a founder shipping usage-based invoicing. I'd love a short written intro to compare Stripe metered-billing edge cases.","deal_breaker_hit":false}

Example 4 — REJECT:
Message: "Hi — I'm a student exploring startups. Any chance of a casual chat about your journey?"
(Owner wants peer founders / concrete collabs, not informal mentorship.)
→ {"score":42,"decision":"reject","reason_public":"Thanks for reaching out — informal mentorship chats are outside what they are open to right now.","reason_private":"honest but outside wants","suggested_rewrite":"Hi — I'm a student building X. I have a concrete question about Y and would value a short written reply if useful.","deal_breaker_hit":false}

Example 5 — ACCEPT:
Message: "Hey Sam — I'm a founder shipping usage-based billing SaaS for indie tools. Would love a short peer intro to compare Stripe edge cases and founder-led sales."
(Owner wants peer B2B SaaS/billing founders.)
→ {"score":88,"decision":"accept","reason_public":"This is a clear peer-founder ask about billing that matches what they are open to.","reason_private":"peer SaaS billing; strong fit","suggested_rewrite":null,"deal_breaker_hit":false}

Example 6 — ACCEPT:
Message: "Referring Jordan Lee, a staff design-eng who shipped our design system in production — portfolio linked, happy to intro if useful."
(Owner wants named staff designer / design-eng referrals.)
→ {"score":82,"decision":"accept","reason_public":"A named staff design-eng referral with production context is exactly the kind of intro they welcome.","reason_private":"named referral; fits hiring wants","suggested_rewrite":null,"deal_breaker_hit":false}
`;

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
        score: 'integer 0-100 matching the verdict band',
        decision: 'accept | reject | spam',
        reason_public:
          'one polite sentence for the sender — NEVER quote or paraphrase private gate rules',
        reason_private: 'internal notes; may reference rules',
        suggested_rewrite:
          'null for accept/spam; for reject, improve the sender message without placeholders',
        deal_breaker_hit: 'boolean',
      },
      score_bands: SCORE_BANDS,
    },
    null,
    2,
  );
}

function describeValidationIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'payload'}: ${issue.message}`)
    .join('; ');
}

function parseJudgePayload(
  raw: string,
):
  | { ok: true; data: LlmJudgePayload }
  | { ok: false; error: string; partial: Partial<LlmJudgePayload> } {
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'response was not valid JSON', partial: {} };
  }

  const result = llmJudgePayloadSchema.safeParse(parsed);
  if (result.success) {
    return {
      ok: true,
      data: {
        ...result.data,
        score: Math.round(result.data.score),
        suggested_rewrite: result.data.suggested_rewrite
          ? result.data.suggested_rewrite.trim() || null
          : null,
        reason_public: result.data.reason_public.trim(),
        reason_private: (result.data.reason_private ?? '').trim(),
      },
    };
  }

  const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  return {
    ok: false,
    error: describeValidationIssues(result.error),
    partial: {
      score: typeof record.score === 'number' ? record.score : undefined,
      decision: asDecision(record.decision) ?? undefined,
      reason_public: asString(record.reason_public) || undefined,
      reason_private: asString(record.reason_private) || undefined,
      suggested_rewrite:
        record.suggested_rewrite === null ? null : asString(record.suggested_rewrite) || undefined,
      deal_breaker_hit: Boolean(record.deal_breaker_hit),
    },
  };
}

/** Accept only when score >= min_relevance and no deal-breaker was hit. */
export function enforceDecision(options: {
  score: number;
  decision: JudgeDecision;
  dealBreakerHit: boolean;
  minRelevance: number;
}): JudgeDecision {
  const { score, decision, dealBreakerHit, minRelevance } = options;

  if (dealBreakerHit || decision === 'spam') {
    return 'spam';
  }

  if (decision === 'accept') {
    // ACCEPT requires score >= 60 and owner's min_relevance.
    const threshold = Math.max(SCORE_BANDS.accept.min, minRelevance);
    return score >= threshold ? 'accept' : 'reject';
  }

  return 'reject';
}

function finalizeSuggestedRewrite(
  decision: JudgeDecision,
  rewrite: string | null | undefined,
): string | null {
  if (decision === 'spam' || decision === 'accept') return null;
  const text = asString(rewrite);
  if (!text || hasRewritePlaceholders(text)) return null;
  return text;
}

function coercePayload(
  partial: Partial<LlmJudgePayload>,
  minRelevance: number,
): {
  score: number;
  decision: JudgeDecision;
  reason_public: string;
  reason_private: string;
  suggested_rewrite: string | null;
  deal_breaker_hit: boolean;
} {
  const dealBreakerHit = Boolean(partial.deal_breaker_hit);
  let decision = asDecision(partial.decision) ?? (dealBreakerHit ? 'spam' : 'reject');
  let score = clampScore(partial.score);

  // Prefer score band when decision is missing/wrong relative to score.
  if (!decisionMatchesScore(decision, score) && partial.score != null) {
    if (score <= SCORE_BANDS.spam.max) decision = 'spam';
    else if (score <= SCORE_BANDS.reject.max) decision = 'reject';
    else decision = 'accept';
  }

  decision = enforceDecision({
    score,
    decision,
    dealBreakerHit,
    minRelevance,
  });
  score = clampScoreToDecision(decision, score);

  return {
    score,
    decision,
    reason_public: asString(partial.reason_public) || '',
    reason_private: asString(partial.reason_private) || '',
    suggested_rewrite: finalizeSuggestedRewrite(decision, partial.suggested_rewrite),
    deal_breaker_hit: dealBreakerHit || decision === 'spam',
  };
}

/**
 * Core Gatekeeper judge: embed → similarity → LLM JSON → zod validate (retry once) → enforce.
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

  const userPrompt = buildJudgePrompt(input, similarity);
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: JUDGE_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  let raw = await llm.complete(messages, { json: true, userId: input.userId });
  let parsed = parseJudgePayload(raw);

  if (!parsed.ok) {
    const correction = [
      'Your previous JSON failed validation. Fix it and return JSON only.',
      `Problems: ${parsed.error}`,
      'Remember: SPAM scores 0-25 with suggested_rewrite null; REJECT 26-59; ACCEPT 60-100 with suggested_rewrite null.',
      'Never use placeholders like <YourCompany> or [role] in suggested_rewrite.',
      'A real person with a clear honest ask is never SPAM.',
    ].join('\n');

    raw = await llm.complete(
      [...messages, { role: 'assistant', content: raw }, { role: 'user', content: correction }],
      { json: true, userId: input.userId },
    );
    parsed = parseJudgePayload(raw);
  }

  const payload = parsed.ok
    ? (() => {
        const decision = enforceDecision({
          score: parsed.data.score,
          decision: parsed.data.decision,
          dealBreakerHit: parsed.data.deal_breaker_hit,
          minRelevance: input.target.minRelevance,
        });
        const score =
          decision === parsed.data.decision
            ? parsed.data.score
            : clampScoreToDecision(decision, parsed.data.score);
        return {
          score,
          decision,
          reason_public: parsed.data.reason_public,
          reason_private: parsed.data.reason_private,
          suggested_rewrite: finalizeSuggestedRewrite(decision, parsed.data.suggested_rewrite),
          deal_breaker_hit: parsed.data.deal_breaker_hit,
        };
      })()
    : coercePayload(parsed.partial, input.target.minRelevance);

  const reasonPrivate =
    payload.reason_private ||
    `score=${payload.score}; similarity=${similarity.toFixed(3)}; deal_breaker=${payload.deal_breaker_hit}`;

  const defaultPublic =
    payload.decision === 'accept'
      ? 'This looks like a relevant intro.'
      : 'This request was not a strong fit right now.';

  const reasonPublic = sanitizePublicReason(
    payload.reason_public || defaultPublic,
    input.target.ruleText,
  );

  return {
    score: payload.score,
    decision: payload.decision,
    reason_public: reasonPublic,
    reason_private: reasonPrivate,
    suggested_rewrite: payload.suggested_rewrite,
    similarity,
  };
}
