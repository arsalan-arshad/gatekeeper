import type { Llm } from './llm.js';

export type InterviewAnswers = {
  who: string;
  want: string;
  never: string;
  dealbreakers: string;
  format: string;
};

export type SynthesizedProfile = {
  name: string;
  bio: string;
  wantsText: string;
  offersText: string;
  neverText: string;
  ruleText: string;
  handleSuggestion: string;
};

export const INTERVIEW_QUESTIONS = [
  {
    id: 'who' as const,
    prompt: 'Who are you? Briefly share your role, context, and what you work on.',
  },
  {
    id: 'want' as const,
    prompt: 'What do you want more of? (intros, opportunities, kinds of people)',
  },
  {
    id: 'never' as const,
    prompt: 'What do you never want to hear about?',
  },
  {
    id: 'dealbreakers' as const,
    prompt: 'What are your deal-breakers for accepting an intro?',
  },
  {
    id: 'format' as const,
    prompt: 'Preferred intro format — length, tone, and what senders should include?',
  },
] as const;

function slugifyHandle(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
  return base || 'member';
}

/** Deterministic fallback when the LLM is unavailable. */
export function synthesizeProfileFromAnswers(answers: InterviewAnswers): SynthesizedProfile {
  const nameGuess =
    answers.who
      .split(/[.\n]/)[0]
      ?.replace(/^i am\s+/i, '')
      .replace(/^i'm\s+/i, '')
      .trim()
      .slice(0, 80) || 'Gatekeeper user';

  const ruleText = [
    `Accept intros that match: ${answers.want.trim()}`,
    `Reject or deprioritize: ${answers.never.trim()}`,
    `Deal-breakers: ${answers.dealbreakers.trim()}`,
    `Preferred intro format: ${answers.format.trim()}`,
    `Context about me: ${answers.who.trim()}`,
  ].join('\n\n');

  return {
    name: nameGuess.slice(0, 120),
    bio: answers.who.trim().slice(0, 500),
    wantsText: answers.want.trim(),
    offersText: '',
    neverText: [answers.never.trim(), answers.dealbreakers.trim()].filter(Boolean).join('\n'),
    ruleText,
    handleSuggestion: slugifyHandle(nameGuess),
  };
}

export async function synthesizeProfile(
  answers: InterviewAnswers,
  llm?: Llm,
): Promise<SynthesizedProfile> {
  const fallback = synthesizeProfileFromAnswers(answers);
  if (!llm) return fallback;

  try {
    const raw = await llm.complete(
      [
        {
          role: 'system',
          content:
            'You help people write plain-English gatekeeper rules. Return JSON only with keys: name, bio, wantsText, offersText, neverText, ruleText, handleSuggestion. ruleText must be editable plain English the user can tweak. handleSuggestion is a short lowercase slug. Never invent private secrets.',
        },
        {
          role: 'user',
          content: JSON.stringify(answers),
        },
      ],
      { json: true },
    );

    const parsed = JSON.parse(raw) as Partial<SynthesizedProfile>;
    return {
      name: String(parsed.name ?? fallback.name).slice(0, 120),
      bio: String(parsed.bio ?? fallback.bio).slice(0, 500),
      wantsText: String(parsed.wantsText ?? fallback.wantsText),
      offersText: String(parsed.offersText ?? fallback.offersText),
      neverText: String(parsed.neverText ?? fallback.neverText),
      ruleText: String(parsed.ruleText ?? fallback.ruleText),
      handleSuggestion: slugifyHandle(String(parsed.handleSuggestion ?? fallback.handleSuggestion)),
    };
  } catch {
    return fallback;
  }
}

export function buildProfileEmbeddingText(input: {
  name: string;
  bio?: string | null;
  wantsText?: string | null;
  offersText?: string | null;
  neverText?: string | null;
  ruleText: string;
}): string {
  return [input.name, input.bio, input.wantsText, input.offersText, input.neverText, input.ruleText]
    .filter(Boolean)
    .join('\n');
}

/** Wants vector text — never includes never_text or private rules. */
export function buildWantsEmbeddingText(input: {
  wantsText?: string | null;
  directoryRole?: string | null;
  directoryTags?: string[] | null;
}): string {
  const tags = (input.directoryTags ?? []).filter(Boolean).join(', ');
  return [input.wantsText, input.directoryRole, tags].filter(Boolean).join('\n');
}

/**
 * Offers vector text. When offers_text is empty (common from the synthesizer
 * fallback), use bio + role + tags so matching still has signal.
 * Never includes never_text or private rules.
 */
export function buildOffersEmbeddingText(input: {
  offersText?: string | null;
  bio?: string | null;
  directoryRole?: string | null;
  directoryTags?: string[] | null;
}): string {
  const tags = (input.directoryTags ?? []).filter(Boolean).join(', ');
  const offers = input.offersText?.trim();
  if (offers) {
    return [offers, input.directoryRole, tags].filter(Boolean).join('\n');
  }
  return [input.bio, input.directoryRole, tags].filter(Boolean).join('\n');
}
