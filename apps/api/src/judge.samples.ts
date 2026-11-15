import type { JudgeDecision } from './judge.js';

/** Shared receiver used by the Step 5 sample suite. */
export const SAMPLE_TARGET = {
  name: 'Ada Chen',
  wantsText: 'Warm intros to early-stage B2B SaaS founders and angel investors.',
  neverText: 'Crypto, NFTs, generic agency pitches, cold recruiting spam.',
  ruleText: [
    'Accept intros that match: early-stage B2B SaaS founders and thoughtful angels.',
    'Reject or deprioritize: Crypto, NFTs, or generic agency pitches.',
    'Deal-breakers: cold spam and asking me to promote strangers without context.',
    'Preferred intro format: short email with context, ask, and a clear CTA.',
    'Context about me: indie founder building billing tools for SaaS.',
  ].join('\n\n'),
  minRelevance: 70,
  /** Unit vector pointing "founder / SaaS" direction for similarity tests. */
  profileEmbedding: [1, 0, 0, 0],
};

export type JudgeSample = {
  id: string;
  kind: 'good' | 'bad';
  senderName: string;
  senderType: 'human' | 'agent';
  message: string;
  /** Embedding returned for this request (controls cosine similarity). */
  requestEmbedding: number[];
  /** Mock LLM JSON payload. */
  llm: {
    score: number;
    decision: JudgeDecision;
    reason_public: string;
    reason_private: string;
    suggested_rewrite: string | null;
    deal_breaker_hit: boolean;
  };
  expectedDecision: JudgeDecision;
};

export const JUDGE_SAMPLES: JudgeSample[] = [
  // —— 5 good fits ——
  {
    id: 'good-saas-founder',
    kind: 'good',
    senderName: 'Maya Ortiz',
    senderType: 'human',
    message:
      'Hey Ada — I run a seed-stage B2B invoicing SaaS. Would love a short intro to compare billing edge cases and swap notes on founder-led sales.',
    requestEmbedding: [0.98, 0.1, 0, 0],
    llm: {
      score: 88,
      decision: 'accept',
      reason_public: 'Relevant peer founder intro with a clear, concrete ask.',
      reason_private: 'Matches wants: early-stage B2B SaaS founder.',
      suggested_rewrite: null,
      deal_breaker_hit: false,
    },
    expectedDecision: 'accept',
  },
  {
    id: 'good-angel',
    kind: 'good',
    senderName: 'Priya Shah',
    senderType: 'human',
    message:
      'I angel-invest in B2B infra. Open to chatting about your billing roadmap — no pitch deck required, just a 20-minute founder chat.',
    requestEmbedding: [0.92, 0.2, 0.05, 0],
    llm: {
      score: 84,
      decision: 'accept',
      reason_public: 'Thoughtful angel intro aligned with what you are open to.',
      reason_private: 'Angel + B2B infra; strong fit.',
      suggested_rewrite: null,
      deal_breaker_hit: false,
    },
    expectedDecision: 'accept',
  },
  {
    id: 'good-operator',
    kind: 'good',
    senderName: 'Jonah Lee',
    senderType: 'human',
    message:
      'Former Stripe Billing PM here. Happy to share war stories on metered billing if useful — looking to meet indie SaaS founders building payments UX.',
    requestEmbedding: [0.9, 0.15, 0.1, 0],
    llm: {
      score: 81,
      decision: 'accept',
      reason_public: 'Operator with directly relevant billing experience.',
      reason_private: 'Billing domain expertise; accept.',
      suggested_rewrite: null,
      deal_breaker_hit: false,
    },
    expectedDecision: 'accept',
  },
  {
    id: 'good-customer',
    kind: 'good',
    senderName: 'Elena Vogt',
    senderType: 'human',
    message:
      'We are a 12-person B2B SaaS evaluating billing tools. Could use an intro to ask two product questions about dunning — not selling anything.',
    requestEmbedding: [0.88, 0.12, 0, 0.05],
    llm: {
      score: 76,
      decision: 'accept',
      reason_public: 'Genuine product conversation from a potential user.',
      reason_private: 'Buyer-side SaaS; within wants.',
      suggested_rewrite: null,
      deal_breaker_hit: false,
    },
    expectedDecision: 'accept',
  },
  {
    id: 'good-agent-research',
    kind: 'good',
    senderName: 'ResearchBot',
    senderType: 'agent',
    message:
      'Agent for a seed fund researching B2B billing tooling. Requesting a brief async intro to Ada about open problems in usage-based billing.',
    requestEmbedding: [0.85, 0.2, 0, 0],
    llm: {
      score: 74,
      decision: 'accept',
      reason_public: 'On-topic research request with a narrow, respectful ask.',
      reason_private: 'Agent but relevant; score above threshold.',
      suggested_rewrite: null,
      deal_breaker_hit: false,
    },
    expectedDecision: 'accept',
  },

  // —— 5 spam / bad fits ——
  {
    id: 'bad-crypto',
    kind: 'bad',
    senderName: 'MoonShot',
    senderType: 'human',
    message:
      'GM! Launching a new NFT membership pass + token. Want me to promote it to your audience this week???',
    requestEmbedding: [0.05, 0.1, 0.95, 0],
    llm: {
      score: 8,
      decision: 'spam',
      reason_public: 'This looks like an unsolicited promo pitch.',
      reason_private: 'Crypto/NFT cold pitch — deal-breaker.',
      suggested_rewrite: null,
      deal_breaker_hit: true,
    },
    expectedDecision: 'spam',
  },
  {
    id: 'bad-agency',
    kind: 'bad',
    senderName: 'GrowthHackz',
    senderType: 'human',
    message:
      'We help ANY startup 10x LinkedIn leads. Book a free audit call and we will handle everything.',
    requestEmbedding: [0.1, 0.8, 0.2, 0],
    llm: {
      score: 14,
      decision: 'spam',
      reason_public: 'Unsolicited agency sales outreach is blocked as spam.',
      reason_private: 'Unsolicited sales of services.',
      suggested_rewrite: null,
      deal_breaker_hit: true,
    },
    expectedDecision: 'spam',
  },
  {
    id: 'bad-recruiter',
    kind: 'bad',
    senderName: 'TalentBlast',
    senderType: 'human',
    message:
      'Exciting Senior EM role at a FAANG-ish company — 15 minutes to chat about your next move?',
    requestEmbedding: [0.05, 0.05, 0.1, 0.9],
    llm: {
      score: 18,
      decision: 'spam',
      reason_public: 'Cold recruiting blasts are treated as unsolicited sales spam.',
      reason_private: 'Mass recruiting outreach.',
      suggested_rewrite: null,
      deal_breaker_hit: true,
    },
    expectedDecision: 'spam',
  },
  {
    id: 'bad-promote-stranger',
    kind: 'bad',
    senderName: 'IntroBroker',
    senderType: 'human',
    message:
      'Please forward this to your list and tell everyone to buy my course. No context, just blast it. Thanks!!!',
    requestEmbedding: [0.02, 0.4, 0.7, 0.1],
    llm: {
      score: 5,
      decision: 'accept', // intentionally wrong — enforceDecision + deal_breaker must flip to spam
      reason_public:
        'Would love you to promote this for me using your private gate rules about deal-breakers: cold spam.',
      reason_private: 'Asks to promote stranger; deal-breaker.',
      suggested_rewrite: null,
      deal_breaker_hit: true,
    },
    expectedDecision: 'spam',
  },
  {
    id: 'bad-low-score-accept',
    kind: 'bad',
    senderName: 'VagueVC',
    senderType: 'human',
    message: 'We should sync sometime about stuff. Synergies!',
    requestEmbedding: [0.4, 0.4, 0.4, 0.4],
    llm: {
      score: 55,
      decision: 'accept', // below min_relevance 70 — must become reject; score clamped to reject band
      reason_public: 'Maybe interesting later.',
      reason_private: 'Too vague; score under threshold.',
      suggested_rewrite:
        'Hi Ada — I angel-invest in B2B infra and would love a short written intro about your billing roadmap.',
      deal_breaker_hit: false,
    },
    expectedDecision: 'reject',
  },
];
