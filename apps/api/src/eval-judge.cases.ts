import type { JudgeDecision } from './judge.js';

/**
 * Labeled cases for `pnpm eval:judge` — judged against the @demo profile (Sam Rivera).
 * Optional `checks` enforce rewrite/reason polish beyond the verdict label.
 */
export type JudgeEvalChecks = {
  /** Rewrite must be a short coaching tip (sparse message), not an invented bio. */
  rewriteIsCoachingTip?: boolean;
  /** Rewrite must not contain placeholder patterns (X, Y, <...>, [...]). */
  rewriteNoPlaceholders?: boolean;
  /** reason_public must sound like Sam's personal gatekeeper, not a company desk. */
  reasonPersonalVoice?: boolean;
};

export type JudgeEvalCase = {
  id: string;
  message: string;
  senderName: string;
  expected: JudgeDecision;
  checks?: JudgeEvalChecks;
};

export const JUDGE_EVAL_CASES: JudgeEvalCase[] = [
  {
    id: 'accept-peer-billing',
    senderName: 'Maya Ortiz',
    expected: 'accept',
    message:
      'Hey Sam — I’m Maya, founder of a usage-based billing SaaS for indie B2B tools (invoicing + metered overages). I’d love a short peer intro to compare Stripe Billing edge cases and founder-led sales — happy to share what we learned on dunning too.',
  },
  {
    id: 'accept-typescript-collab',
    senderName: 'Dev Patel',
    expected: 'accept',
    message:
      'Hi Sam — senior TypeScript engineer who’s shipped metered billing APIs. Open to a short collab intro about usage-based invoice edge cases if useful.',
  },
  {
    id: 'accept-early-customer',
    senderName: 'Elena Vogt',
    expected: 'accept',
    message:
      'We run a 10-person B2B SaaS evaluating usage-based billing. Two concrete questions about overage invoicing — not selling anything, just want a short product chat.',
  },
  {
    id: 'accept-peer-founder-sales',
    senderName: 'Jonah Lee',
    expected: 'accept',
    message:
      'Fellow indie SaaS founder here shipping B2B billing add-ons. Would value a peer intro to swap notes on founder-led sales for usage-based plans.',
  },
  {
    id: 'reject-coffee-chat',
    senderName: 'Alex Kim',
    expected: 'reject',
    message:
      'Hey — would love to pick your brain over coffee sometime and hear your founder journey. No specific ask yet, just a quick sync!',
    checks: {
      rewriteIsCoachingTip: true,
      rewriteNoPlaceholders: true,
      reasonPersonalVoice: true,
    },
  },
  {
    id: 'reject-vague-partnership',
    senderName: 'Riley Chen',
    expected: 'reject',
    message:
      'Excited about potential synergies and partnership opportunities. Let’s connect when you have a moment!',
    checks: {
      rewriteIsCoachingTip: true,
      rewriteNoPlaceholders: true,
    },
  },
  {
    id: 'reject-mentorship',
    senderName: 'Sam Student',
    expected: 'reject',
    message:
      'Hi Sam — I’m a student exploring startups. Any chance of a casual chat about your journey and advice for beginners?',
    checks: {
      rewriteNoPlaceholders: true,
      reasonPersonalVoice: true,
    },
  },
  {
    id: 'reject-wrong-audience',
    senderName: 'ConsumerApp',
    expected: 'reject',
    message:
      'I built a consumer meditation app and wanted feedback from any founder. Can we hop on a call this week?',
    checks: {
      rewriteNoPlaceholders: true,
    },
  },
  {
    id: 'spam-crypto',
    senderName: 'MoonShot',
    expected: 'spam',
    message:
      'Hot crypto NFT token launch — promote to your audience for guaranteed leads!! Limited spots.',
  },
  {
    id: 'spam-seo-agency',
    senderName: 'GrowthHackz',
    expected: 'spam',
    message:
      'We help ANY startup 10x LinkedIn leads with our SEO agency. Book a free audit — guaranteed pipeline!!!',
  },
  {
    id: 'spam-guaranteed-leads',
    senderName: 'LeadFactory',
    expected: 'spam',
    message:
      'Buy our guaranteed B2B leads list this week — 500 SaaS emails, mass outreach sequences included.',
  },
  {
    id: 'spam-nft-promo',
    senderName: 'TokenDrop',
    expected: 'spam',
    message:
      'GM! Launching an NFT membership pass + token. Want me to blast it to your audience for a rev share???',
  },
  {
    id: 'reject-sparse-coaching-tip',
    senderName: 'Anon',
    expected: 'reject',
    message: 'Hi want to chat sometime?',
    checks: {
      rewriteIsCoachingTip: true,
      rewriteNoPlaceholders: true,
      reasonPersonalVoice: true,
    },
  },
  {
    id: 'reject-no-invented-placeholders',
    senderName: 'Jordan',
    expected: 'reject',
    message: 'Quick sync to explore opportunities?',
    checks: {
      rewriteIsCoachingTip: true,
      rewriteNoPlaceholders: true,
      reasonPersonalVoice: true,
    },
  },
  {
    id: 'reject-personal-gatekeeper-voice',
    senderName: 'Casey Lee',
    expected: 'reject',
    message:
      'Would love to pick your brain over coffee and hear how you built everything — no agenda yet.',
    checks: {
      reasonPersonalVoice: true,
      rewriteNoPlaceholders: true,
      rewriteIsCoachingTip: true,
    },
  },
  {
    id: 'reject-borderline-explore-opportunities',
    senderName: 'Jordan Lee',
    expected: 'reject',
    message: 'Quick sync to explore opportunities?',
    checks: {
      rewriteIsCoachingTip: true,
      rewriteNoPlaceholders: true,
      reasonPersonalVoice: true,
    },
  },
  {
    id: 'reject-borderline-lets-connect',
    senderName: 'Morgan Park',
    expected: 'reject',
    message: "Let's connect when you have a moment!",
    checks: {
      rewriteIsCoachingTip: true,
      rewriteNoPlaceholders: true,
      reasonPersonalVoice: true,
    },
  },
  {
    id: 'reject-borderline-pick-your-brain',
    senderName: 'Taylor Brooks',
    expected: 'reject',
    message: 'Would love to pick your brain sometime.',
    checks: {
      rewriteIsCoachingTip: true,
      rewriteNoPlaceholders: true,
      reasonPersonalVoice: true,
    },
  },
  {
    id: 'reject-offprofile-investor-northzone',
    senderName: 'Northzone Partner',
    expected: 'reject',
    message:
      "Hi Sam — I'm a partner at Northzone in London. We're looking at pre-seed investment in usage-based billing tools and would love 20 min next week if you're open to it. More at northzone.com.",
    checks: {
      rewriteIsCoachingTip: true,
      rewriteNoPlaceholders: true,
      reasonPersonalVoice: true,
    },
  },
];
