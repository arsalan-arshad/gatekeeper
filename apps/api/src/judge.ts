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
  /**
   * True when the final LLM JSON passed zod + post-checks (including after one correction).
   * False for coerced/fallback outputs — demo cache must not store these.
   */
  schema_valid: boolean;
};

/**
 * Bump whenever the system prompt, few-shots, or verdict rules change.
 * Included in the demo verdict cache key so stale judgments are never served.
 */
export const PROMPT_VERSION = '2026-11-15-v5';

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

/** Placeholders the model must never emit in rewrites (or reasons). */
const PLACEHOLDER_RE =
  /<[^>\n]+>|\[[^\]]+\]|\{[A-Za-z][^}]*\}|\bYourCompany\b|\bYourName\b|\bTBD\b|\bTODO\b|\b(?:X|Y|Z)\b/i;

/** Corporate/support desk voice — reasons must sound like a personal gatekeeper instead. */
const COMPANY_VOICE_RE =
  /\b(appropriate team|our team|the team|forward(?:ed|ing)? (?:this )?to (?:the )?(?:appropriate )?team|customer support|as a company|our staff)\b/i;

const COACHING_TIP_RE =
  /^(say |add |include |tell |mention |write |share )|\bwho you are\b|\bwhat specific\b|\bwhy \w+/i;

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
          'suggested_rewrite must not invent facts or use placeholders like X, Y, <YourCompany>, or [role]',
        path: ['suggested_rewrite'],
      });
    }

    if (hasRewritePlaceholders(data.reason_public) || hasCompanyVoice(data.reason_public)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'reason_public must be one personal-gatekeeper sentence (no placeholders, no company/team voice)',
        path: ['reason_public'],
      });
    }
  });

export type LlmJudgePayload = z.infer<typeof llmJudgePayloadSchema>;

/** True when rewrite text contains banned placeholders (X/Y, <...>, [...], etc.). */
export function hasRewritePlaceholders(text: string): boolean {
  return PLACEHOLDER_RE.test(text);
}

/** True when the reason sounds like a company desk rather than a personal gatekeeper. */
export function hasCompanyVoice(text: string): boolean {
  return COMPANY_VOICE_RE.test(text);
}

/** Coaching tip (not a forged full message) for sparse rejects. */
export function isCoachingTip(text: string): boolean {
  return COACHING_TIP_RE.test(text.trim());
}

/** Default sparse-message tip naming the owner when known. */
export function defaultCoachingTip(ownerName?: string | null): string {
  const who = ownerName?.trim() || 'them';
  return `Say who you are, what specific thing you want from ${who}, and why ${who}.`;
}

/**
 * True when a full rewrite appears to invent a proper name/product not present
 * in the sender message or sender name. Coaching tips are exempt.
 */
export function inventsFactsInRewrite(
  rewrite: string,
  message: string,
  senderName: string,
  ownerName?: string | null,
): boolean {
  const text = rewrite.trim();
  if (!text || isCoachingTip(text)) return false;

  const allowed = `${message}\n${senderName}\n${ownerName ?? ''}`.toLowerCase();
  const properNouns = text.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b/g) ?? [];

  for (const noun of properNouns) {
    const lower = noun.toLowerCase();
    // Skip sentence-initial filler when it is a single common word.
    if (
      /^(hey|hi|hello|thanks|thank|dear|regarding|about|looking|open|fellow|senior|former)$/i.test(
        noun,
      )
    ) {
      continue;
    }
    if (!allowed.includes(lower)) {
      return true;
    }
  }

  return false;
}

/** Post-check after zod parse — placeholders, invented facts, company voice. */
export function describeJudgeOutputIssues(
  payload: Pick<LlmJudgePayload, 'decision' | 'reason_public' | 'suggested_rewrite'>,
  context: { message: string; senderName: string; ownerName?: string | null },
): string[] {
  const issues: string[] = [];

  if (hasRewritePlaceholders(payload.reason_public) || hasCompanyVoice(payload.reason_public)) {
    issues.push(
      'reason_public must be the owner’s personal gatekeeper voice (e.g. "I\'ll pass this to Sam"), never a company/team desk',
    );
  }

  if (payload.decision === 'reject' && payload.suggested_rewrite) {
    if (hasRewritePlaceholders(payload.suggested_rewrite)) {
      issues.push('suggested_rewrite has placeholders (X, Y, <...>, [...])');
    } else if (
      inventsFactsInRewrite(
        payload.suggested_rewrite,
        context.message,
        context.senderName,
        context.ownerName,
      )
    ) {
      issues.push(
        'suggested_rewrite invents a name/company/product not present in the sender message — reuse only their facts or return a coaching tip',
      );
    }
  }

  return issues;
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

SPAM (score 0–25) = ONLY promos, scams, crypto/NFT blasts, guaranteed-leads promises, mass outreach templates, or clearly automated/unsolicited sales sequences. SPAM requires a promo/scam/mass-template/automated-outreach signal. Nothing else is spam.
REJECT (score 26–59) = A genuine personalized human request that is vague OR off-profile (does not fit the owner's stated wants) — including specific investor/VC meeting asks when the owner is not taking investment, wrong-audience collabs, mentorship, or coffee chats. Prefer REJECT + a short coaching tip over SPAM whenever the sender looks like a real named human with a specific honest ask.
ACCEPT (score 60–100) = Specific, honest, matches the owner's stated wants, and score >= 60.

Critical: a real person with a clear honest ask must NEVER be SPAM — use REJECT if it is a weak/off-profile fit, ACCEPT if it matches.
Critical: off-profile but genuine personalized asks (named investor/partner, firm, city, concrete ask + link) are REJECT (26–59) with a coaching tip — never SPAM — even when the owner is not taking investment or that topic.
Critical: borderline vague openers from a real-looking human ("Quick sync to explore opportunities?", "Let's connect", "pick your brain") are REJECT with a coaching tip — never SPAM.

## Score bands (must match verdict)
- SPAM → 0–25
- REJECT → 26–59
- ACCEPT → 60–100

## suggested_rewrite
Only reuse facts already present in the sender's message (and their given sender name).
Never invent a name, company, product, or problem.
Never output X, Y, <...>, [...], {Name}, or any other placeholder.
Never copy the owner's profile into the rewrite.
If the message has too few facts to rewrite honestly, return a short coaching tip instead — e.g. "Say who you are, what specific thing you want from Sam, and why Sam."
If verdict is SPAM: suggested_rewrite must be null.
If verdict is ACCEPT: suggested_rewrite must be null.
If verdict is REJECT: either a fact-faithful improved message OR a coaching tip (never invented details).

## reason_public
Exactly one grammatically correct polite sentence as the owner's personal gatekeeper speaking to the sender.
Speak in first person about the owner by name when known (e.g. "I'll pass this to Sam" / "Sam isn't taking vague coffee chats right now").
Never sound like a company desk ("forward to the appropriate team", "our staff", etc.).
Never quote private rules.

## Few-shot examples

Example 1 — SPAM:
Message: "Hot crypto NFT token launch — promote to your audience for guaranteed leads!!"
→ {"score":8,"decision":"spam","reason_public":"I won't pass unsolicited crypto or NFT pitches along to Sam.","reason_private":"crypto/NFT blast","suggested_rewrite":null,"deal_breaker_hit":true}

Example 2 — SPAM:
Message: "We 10x any SaaS with guaranteed leads — book a free SEO agency audit today!!!"
→ {"score":12,"decision":"spam","reason_public":"I block mass agency sales outreach before it reaches Sam.","reason_private":"unsolicited agency sales","suggested_rewrite":null,"deal_breaker_hit":true}

Example 3 — REJECT (sparse → coaching tip, do NOT invent a bio):
Message: "Quick sync sometime? Would love to pick your brain over coffee — no agenda yet."
→ {"score":34,"decision":"reject","reason_public":"Sam isn't taking vague coffee chats right now — send a specific written ask.","reason_private":"vague; no concrete ask","suggested_rewrite":"Say who you are, what specific thing you want from Sam, and why Sam.","deal_breaker_hit":false}

Example 4 — REJECT (reuse only sender facts; no X/Y placeholders):
Message: "Hi — I'm a student exploring startups. Any chance of a casual chat about your journey?"
(Owner wants peer founders / concrete collabs, not informal mentorship.)
→ {"score":42,"decision":"reject","reason_public":"I'll pass on informal mentorship chats — Sam is focused on concrete peer asks.","reason_private":"honest but outside wants","suggested_rewrite":"Say who you are, what specific thing you want from Sam, and why Sam.","deal_breaker_hit":false}

Example 5 — ACCEPT:
Message: "Hey Sam — I'm a founder shipping usage-based billing SaaS for indie tools. Would love a short peer intro to compare Stripe edge cases and founder-led sales."
(Owner wants peer B2B SaaS/billing founders.)
→ {"score":88,"decision":"accept","reason_public":"I'll pass this to Sam — it's a clear peer-founder billing ask he welcomes.","reason_private":"peer SaaS billing; strong fit","suggested_rewrite":null,"deal_breaker_hit":false}

Example 6 — ACCEPT:
Message: "Referring Jordan Lee, a staff design-eng who shipped our design system in production — portfolio linked, happy to intro if useful."
(Owner wants named staff designer / design-eng referrals.)
→ {"score":82,"decision":"accept","reason_public":"I'll pass this named staff design-eng referral to Sam.","reason_private":"named referral; fits hiring wants","suggested_rewrite":null,"deal_breaker_hit":false}

Example 7 — REJECT (borderline vague human opener — NOT spam):
Message: "Quick sync to explore opportunities?"
→ {"score":34,"decision":"reject","reason_public":"Sam isn't taking vague quick-sync asks right now — send a specific written ask.","reason_private":"vague opener; no pitch signal","suggested_rewrite":"Say who you are, what specific thing you want from Sam, and why Sam.","deal_breaker_hit":false}

Example 8 — REJECT (borderline vague human opener — NOT spam):
Message: "Let's connect when you have a moment!"
→ {"score":32,"decision":"reject","reason_public":"I'll pass on open-ended connect requests — Sam needs a concrete written ask.","reason_private":"vague connect; human not pitch","suggested_rewrite":"Say who you are, what specific thing you want from Sam, and why Sam.","deal_breaker_hit":false}

Example 9 — REJECT (borderline vague human opener — NOT spam):
Message: "Would love to pick your brain sometime."
→ {"score":36,"decision":"reject","reason_public":"Sam isn't taking pick-your-brain chats without a specific ask.","reason_private":"vague brain-pick; reject not spam","suggested_rewrite":"Say who you are, what specific thing you want from Sam, and why Sam.","deal_breaker_hit":false}

Example 10 — REJECT (genuine personalized investor ask, off-profile — NOT spam):
Message: "Hello — partner at Accel covering seed in Berlin. Specific thesis on metered SaaS; free for a 15-minute call Thursday? Site: accel.com."
(Owner wants peer founders / customers / collabs — not taking investment.)
→ {"score":44,"decision":"reject","reason_public":"I'll pass on investment meeting asks — Sam isn't raising and focuses on peer founder intros.","reason_private":"genuine VC ask; off-profile not spam","suggested_rewrite":"Say who you are, what peer-founder or customer ask you have for Sam (not investment), and why Sam.","deal_breaker_hit":false}
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
          "one polite personal-gatekeeper sentence (e.g. I'll pass this to Sam) — NEVER company/team voice; NEVER quote private rules",
        reason_private: 'internal notes; may reference rules',
        suggested_rewrite:
          'null for accept/spam; for reject, fact-faithful rewrite OR short coaching tip — never invent facts or placeholders',
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
  context: { message: string; senderName: string; ownerName?: string | null },
): string | null {
  if (decision === 'spam' || decision === 'accept') return null;
  const text = asString(rewrite);
  if (
    text &&
    !hasRewritePlaceholders(text) &&
    !inventsFactsInRewrite(text, context.message, context.senderName, context.ownerName)
  ) {
    return text;
  }
  // Sparse / invalid rewrite → coaching tip instead of inventing facts.
  return defaultCoachingTip(context.ownerName);
}

function personalDefaultReason(decision: JudgeDecision, ownerName?: string | null): string {
  const who = ownerName?.trim() || 'them';
  if (decision === 'accept') {
    return `I'll pass this to ${who} — it looks like a relevant intro.`;
  }
  if (decision === 'spam') {
    return `I won't pass this along to ${who}.`;
  }
  return `This isn't a strong fit for ${who} right now.`;
}

function finalizePublicReason(
  decision: JudgeDecision,
  reason: string,
  privateRuleText: string,
  ownerName?: string | null,
): string {
  const cleaned = sanitizePublicReason(
    reason || personalDefaultReason(decision, ownerName),
    privateRuleText,
  );
  if (hasRewritePlaceholders(cleaned) || hasCompanyVoice(cleaned)) {
    return personalDefaultReason(decision, ownerName);
  }
  return cleaned;
}

function coercePayload(
  partial: Partial<LlmJudgePayload>,
  minRelevance: number,
  context: { message: string; senderName: string; ownerName?: string | null },
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
    suggested_rewrite: finalizeSuggestedRewrite(decision, partial.suggested_rewrite, context),
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

  const rewriteContext = {
    message: input.message,
    senderName: input.senderName,
    ownerName: input.target.name,
  };

  const userPrompt = buildJudgePrompt(input, similarity);
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: JUDGE_SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];

  const completeOpts = { json: true as const, temperature: 0, userId: input.userId };

  let raw = await llm.complete(messages, completeOpts);
  let parsed = parseJudgePayload(raw);
  let postIssues = parsed.ok ? describeJudgeOutputIssues(parsed.data, rewriteContext) : [];

  if (!parsed.ok || postIssues.length > 0) {
    const problems = !parsed.ok ? parsed.error : postIssues.join('; ');
    const correction = [
      'Your previous JSON failed validation. Fix it and return JSON only.',
      `Problems: ${problems}`,
      'Remember: SPAM scores 0-25 with suggested_rewrite null; REJECT 26-59; ACCEPT 60-100 with suggested_rewrite null.',
      'suggested_rewrite may only reuse facts from the sender message — never invent a name/company/product, never output X, Y, <...>, or [...].',
      'If the message is too sparse, return a coaching tip like "Say who you are, what specific thing you want from Sam, and why Sam."',
      'reason_public must be the owner\'s personal gatekeeper (e.g. "I\'ll pass this to Sam"), never a company/team desk.',
      'A real person with a clear honest ask is never SPAM.',
      'Borderline vague human openers ("Quick sync to explore opportunities?", "Let\'s connect", "pick your brain") are REJECT with a coaching tip — never SPAM.',
    ].join('\n');

    raw = await llm.complete(
      [...messages, { role: 'assistant', content: raw }, { role: 'user', content: correction }],
      completeOpts,
    );
    parsed = parseJudgePayload(raw);
    postIssues = parsed.ok ? describeJudgeOutputIssues(parsed.data, rewriteContext) : [];
  }

  const schemaValid = parsed.ok && postIssues.length === 0;

  let payload: {
    score: number;
    decision: JudgeDecision;
    reason_public: string;
    reason_private: string;
    suggested_rewrite: string | null;
    deal_breaker_hit: boolean;
  };

  if (schemaValid && parsed.ok) {
    const data = parsed.data;
    const decision = enforceDecision({
      score: data.score,
      decision: data.decision,
      dealBreakerHit: data.deal_breaker_hit,
      minRelevance: input.target.minRelevance,
    });
    const score =
      decision === data.decision ? data.score : clampScoreToDecision(decision, data.score);
    payload = {
      score,
      decision,
      reason_public: data.reason_public,
      reason_private: data.reason_private,
      suggested_rewrite: finalizeSuggestedRewrite(decision, data.suggested_rewrite, rewriteContext),
      deal_breaker_hit: data.deal_breaker_hit,
    };
  } else {
    payload = coercePayload(
      parsed.ok ? parsed.data : parsed.partial,
      input.target.minRelevance,
      rewriteContext,
    );
  }

  const reasonPrivate =
    payload.reason_private ||
    `score=${payload.score}; similarity=${similarity.toFixed(3)}; deal_breaker=${payload.deal_breaker_hit}`;

  const reasonPublic = finalizePublicReason(
    payload.decision,
    payload.reason_public,
    input.target.ruleText,
    input.target.name,
  );

  return {
    score: payload.score,
    decision: payload.decision,
    reason_public: reasonPublic,
    reason_private: reasonPrivate,
    suggested_rewrite: payload.suggested_rewrite,
    similarity,
    schema_valid: schemaValid,
  };
}
