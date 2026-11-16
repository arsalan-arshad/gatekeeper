/** Client-safe demo profile metadata (mirrors API public fields). */
export type DemoProfileOption = {
  handle: string;
  name: string;
  label: string;
  bio: string;
  wantsText: string;
};

export const DEMO_PROFILE_OPTIONS: DemoProfileOption[] = [
  {
    handle: 'demo',
    name: 'Sam Rivera',
    label: 'Indie SaaS founder',
    bio: 'Building a usage-based billing product for indie SaaS. Open to peer intros — not cold pitches.',
    wantsText:
      'Peer founders shipping B2B SaaS, early customers with a concrete use case, senior TypeScript collaborators.',
  },
  {
    handle: 'ada',
    name: 'Ada Okonkwo',
    label: 'Billing tooling founder',
    bio: 'Founder building B2B billing tooling. Open to peer intros, not vendor pitches.',
    wantsText: 'Peer founders shipping usage-based billing; hiring senior TypeScript engineers.',
  },
  {
    handle: 'jonas',
    name: 'Jonas Berg',
    label: 'Remote hiring lead',
    bio: 'Remote hiring lead for a distributed design systems team.',
    wantsText: 'Referrals for staff designers and design-eng hybrids who ship in production.',
  },
  {
    handle: 'mira',
    name: 'Mira Chen',
    label: 'Agent trust researcher',
    bio: 'Indie researcher writing about agent reputation and trust ledgers.',
    wantsText: 'Researchers and builders with concrete experiments on agent trust.',
  },
];

export const DEMO_PLACEHOLDERS = [
  'Hey — I’m a founder shipping usage-based billing SaaS. Wanted a short peer intro to compare Stripe edge cases…',
  'Referring a staff designer who ships design systems in production — portfolio + why they’d fit…',
  'Research collab: I have a concrete agent-trust experiment and a draft artifact to share…',
  'Quick sync to pick your brain over coffee sometime?',
  'Hot crypto NFT token launch — promote to your audience for guaranteed leads!!',
];

/**
 * One-click sample requests for the landing Try-it-now demo.
 * Strong/weak are tuned for the default @demo profile (Sam Rivera — peer B2B SaaS/billing).
 */
export const DEMO_CHIPS = [
  {
    id: 'spam' as const,
    label: 'Spam example',
    message:
      'Hot crypto NFT token launch — promote to your audience for guaranteed leads!! Limited spots.',
  },
  {
    id: 'weak' as const,
    label: 'Weak example',
    message:
      'Hey — would love to pick your brain over coffee sometime and hear your founder journey. No specific ask yet, just a quick sync!',
  },
  {
    id: 'strong' as const,
    label: 'Strong example',
    message:
      'Hey Sam — I’m Maya, founder of a usage-based billing SaaS for indie B2B tools (invoicing + metered overages). I’d love a short peer intro to compare Stripe Billing edge cases and founder-led sales — happy to share what we learned on dunning too.',
  },
] as const;

/** Static ledger payload when /@demo is viewed without a live DB (still labeled Demo data). */
export const DEMO_LEDGER_FALLBACK = {
  scope: 'user' as const,
  user: { handle: 'demo', name: 'Sam Rivera' },
  totals: {
    requestCount: 12,
    acceptedCount: 6,
    deliveredCount: 5,
    spamCount: 3,
    helpfulCount: 4,
    // accepted / total_requests (Accepted ≥ Delivered)
    acceptRate: Number((6 / 12).toFixed(4)),
    trustScore: 0.8,
  },
  months: [
    {
      month: new Date().toISOString().slice(0, 7),
      requestCount: 5,
      acceptedCount: 3,
      deliveredCount: 2,
      spamCount: 1,
      helpfulCount: 2,
      acceptRate: 0.6,
    },
    {
      month: (() => {
        const d = new Date();
        d.setUTCMonth(d.getUTCMonth() - 1);
        return d.toISOString().slice(0, 7);
      })(),
      requestCount: 4,
      acceptedCount: 2,
      deliveredCount: 2,
      spamCount: 1,
      helpfulCount: 1,
      acceptRate: 0.5,
    },
    {
      month: (() => {
        const d = new Date();
        d.setUTCMonth(d.getUTCMonth() - 2);
        return d.toISOString().slice(0, 7);
      })(),
      requestCount: 3,
      acceptedCount: 1,
      deliveredCount: 1,
      spamCount: 1,
      helpfulCount: 1,
      acceptRate: Number((1 / 3).toFixed(4)),
    },
  ],
};

export const DEMO_USER_FALLBACK = {
  handle: 'demo',
  name: 'Sam Rivera',
  bio: 'Building a usage-based billing product for indie SaaS. Open to peer intros — not cold pitches.',
  wantsText:
    'Peer founders shipping B2B SaaS, early customers with a concrete use case, senior TypeScript collaborators.',
  offersText: 'Honest notes on billing edge cases, founder-led sales, and shipping AGPL tools.',
};
