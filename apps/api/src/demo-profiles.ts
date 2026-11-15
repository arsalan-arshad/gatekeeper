/**
 * Public demo profiles for the landing "Try it now" judge and /@demo seed.
 * Private rule text stays server-side; only public fields are safe to echo to clients.
 */

export type DemoProfilePublic = {
  handle: string;
  name: string;
  label: string;
  bio: string;
  wantsText: string;
  offersText: string;
  neverText: string;
  minRelevance: number;
};

export type DemoProfile = DemoProfilePublic & {
  ruleText: string;
  /** Keywords that strongly support accept when present. */
  acceptSignals: string[];
  /** Keywords that trigger spam. */
  spamSignals: string[];
  /** Keywords that are weak/reject fits (not spam). */
  rejectSignals: string[];
};

export const DEMO_PROFILES: DemoProfile[] = [
  {
    handle: 'demo',
    name: 'Sam Rivera',
    label: 'Indie SaaS founder',
    bio: 'Building a usage-based billing product for indie SaaS. Open to peer intros — not cold pitches.',
    wantsText:
      'Peer founders shipping B2B SaaS, early customers with a concrete use case, senior TypeScript collaborators.',
    offersText: 'Honest notes on billing edge cases, founder-led sales, and shipping AGPL tools.',
    neverText: 'Crypto, NFTs, generic SEO agencies, “quick sync” with no written ask.',
    ruleText:
      'Accept peer founder intros about B2B SaaS/billing and senior eng collabs with a clear ask. Reject vague coffee chats and cold sales. Spam crypto, NFT, and agency blasts.',
    minRelevance: 70,
    acceptSignals: [
      'saas',
      'billing',
      'founder',
      'usage-based',
      'typescript',
      'peer',
      'customer',
      'invoice',
      'stripe',
      'collaborate',
    ],
    spamSignals: ['crypto', 'nft', 'token', 'seo agency', 'rank your site', 'guaranteed leads'],
    rejectSignals: ['quick sync', 'pick your brain', 'coffee chat', 'partnership opportunity'],
  },
  {
    handle: 'ada',
    name: 'Ada Okonkwo',
    label: 'Billing tooling founder',
    bio: 'Founder building B2B billing tooling. Open to peer intros, not vendor pitches.',
    wantsText: 'Peer founders shipping usage-based billing; hiring senior TypeScript engineers.',
    offersText: 'Honest notes on Stripe alternatives, early customer discovery, and AGPL products.',
    neverText: 'Cold crypto, NFT, generic SEO agencies, or “quick sync” without a written ask.',
    ruleText:
      'Accept peer founder intros about billing/payments and senior eng hiring. Reject cold sales, crypto, and vague coffee chats. Spam anything that ignores my never list.',
    minRelevance: 70,
    acceptSignals: [
      'billing',
      'payments',
      'usage-based',
      'typescript',
      'founder',
      'engineer',
      'hiring',
      'saas',
    ],
    spamSignals: ['crypto', 'nft', 'seo', 'token launch'],
    rejectSignals: ['quick sync', 'agency', 'coffee'],
  },
  {
    handle: 'jonas',
    name: 'Jonas Berg',
    label: 'Remote hiring lead',
    bio: 'Remote hiring lead for a distributed design systems team.',
    wantsText: 'Referrals for staff designers and design-eng hybrids who ship in production.',
    offersText: 'Compensation bands transparency and intro to other remote-first hiring leads.',
    neverText: 'Recruiting agencies without a named candidate; mass outreach sequences.',
    ruleText:
      'Accept named candidate referrals and peer hiring-lead intros. Reject agency spam and unsolicited product demos.',
    minRelevance: 65,
    acceptSignals: [
      'designer',
      'design system',
      'referral',
      'candidate',
      'hiring',
      'staff',
      'design-eng',
      'portfolio',
    ],
    spamSignals: ['recruiting agency', 'we have 500 candidates', 'mass outreach', 'blast'],
    rejectSignals: ['product demo', 'sales call', 'tooling pitch'],
  },
  {
    handle: 'mira',
    name: 'Mira Chen',
    label: 'Agent trust researcher',
    bio: 'Indie researcher writing about agent reputation and trust ledgers.',
    wantsText: 'Researchers and builders with concrete experiments on agent trust.',
    offersText: 'Draft feedback and citations in public essays.',
    neverText: 'Fundraising decks, token launches, or “AI wrapper” pitches.',
    ruleText:
      'Accept research collabs with a clear artifact. Reject fundraising and wrapper pitches. Mark token spam as spam.',
    minRelevance: 72,
    acceptSignals: [
      'research',
      'reputation',
      'ledger',
      'trust',
      'experiment',
      'paper',
      'artifact',
      'agent',
    ],
    spamSignals: ['token launch', 'fundraising', 'seed round', 'ai wrapper', 'raise'],
    rejectSignals: ['pitch deck', 'investment', 'demo day'],
  },
];

export function getDemoProfile(handle: string): DemoProfile | undefined {
  const normalized = handle.replace(/^@/, '').toLowerCase();
  return DEMO_PROFILES.find((p) => p.handle === normalized);
}

export function listDemoProfilesPublic(): DemoProfilePublic[] {
  return DEMO_PROFILES.map(
    ({ handle, name, label, bio, wantsText, offersText, neverText, minRelevance }) => ({
      handle,
      name,
      label,
      bio,
      wantsText,
      offersText,
      neverText,
      minRelevance,
    }),
  );
}
