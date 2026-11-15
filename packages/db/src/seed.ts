/**
 * Demo seed data for local launch demos.
 *
 * Usage:
 *   DATABASE_URL=… pnpm --filter @gatekeeper/db db:seed
 *
 * Idempotent on handle/email — re-running updates the same demo users
 * and replaces labeled demo requests for @demo.
 */
import { eq } from 'drizzle-orm';

import { createDb } from './index.js';
import { gateRules, requests, users } from './schema.js';

const DEMO_USERS = [
  {
    handle: 'demo',
    name: 'Sam Rivera',
    email: 'demo@demo.gatekeeper.local',
    bio: 'Building a usage-based billing product for indie SaaS. Open to peer intros — not cold pitches.',
    wantsText:
      'Peer founders shipping B2B SaaS, early customers with a concrete use case, senior TypeScript collaborators.',
    offersText: 'Honest notes on billing edge cases, founder-led sales, and shipping AGPL tools.',
    neverText: 'Crypto, NFTs, generic SEO agencies, “quick sync” with no written ask.',
    ruleText:
      'Accept peer founder intros about B2B SaaS/billing and senior eng collabs with a clear ask. Reject vague coffee chats and cold sales. Spam crypto, NFT, and agency blasts.',
    minRelevance: 70,
  },
  {
    handle: 'ada',
    name: 'Ada Okonkwo',
    email: 'ada@demo.gatekeeper.local',
    bio: 'Founder building B2B billing tooling. Open to peer intros, not vendor pitches.',
    wantsText: 'Peer founders shipping usage-based billing; hiring senior TypeScript engineers.',
    offersText: 'Honest notes on Stripe alternatives, early customer discovery, and AGPL products.',
    neverText: 'Cold crypto, NFT, generic SEO agencies, or “quick sync” without a written ask.',
    ruleText:
      'Accept peer founder intros about billing/payments and senior eng hiring. Reject cold sales, crypto, and vague coffee chats. Spam anything that ignores my never list.',
    minRelevance: 70,
  },
  {
    handle: 'jonas',
    name: 'Jonas Berg',
    email: 'jonas@demo.gatekeeper.local',
    bio: 'Remote hiring lead for a distributed design systems team.',
    wantsText: 'Referrals for staff designers and design-eng hybrids who ship in production.',
    offersText: 'Compensation bands transparency and intro to other remote-first hiring leads.',
    neverText: 'Recruiting agencies without a named candidate; mass outreach sequences.',
    ruleText:
      'Accept named candidate referrals and peer hiring-lead intros. Reject agency spam and unsolicited product demos.',
    minRelevance: 65,
  },
  {
    handle: 'mira',
    name: 'Mira Chen',
    email: 'mira@demo.gatekeeper.local',
    bio: 'Indie researcher writing about agent reputation and trust ledgers.',
    wantsText: 'Researchers and builders with concrete experiments on agent trust.',
    offersText: 'Draft feedback and citations in public essays.',
    neverText: 'Fundraising decks, token launches, or “AI wrapper” pitches.',
    ruleText:
      'Accept research collabs with a clear artifact. Reject fundraising and wrapper pitches. Mark token spam as spam.',
    minRelevance: 72,
  },
] as const;

type DemoRequestSeed = {
  label: string;
  senderType: 'human' | 'agent';
  senderName: string;
  senderContact: string;
  message: string;
  aiScore: number;
  aiReason: string;
  decision: 'accept' | 'reject' | 'spam';
  status: 'pending' | 'delivered' | 'accepted' | 'declined';
  helpful: boolean | null;
  /** Months ago (0 = this month). */
  monthsAgo: number;
  dayOffset: number;
};

/** Labeled sample traffic for @demo ledger charts. */
const DEMO_REQUESTS: DemoRequestSeed[] = [
  {
    label: 'accept-peer-founder',
    senderType: 'human',
    senderName: 'Maya Ortiz',
    senderContact: 'maya@example.com',
    message:
      'Peer founder shipping usage-based invoicing — would love a short intro to compare billing edge cases.',
    aiScore: 88,
    aiReason: 'Relevant peer SaaS founder with a concrete ask.',
    decision: 'accept',
    status: 'accepted',
    helpful: true,
    monthsAgo: 0,
    dayOffset: 2,
  },
  {
    label: 'accept-customer',
    senderType: 'human',
    senderName: 'Chris Park',
    senderContact: 'chris@acme.dev',
    message:
      'We run a small B2B SaaS and need usage-based billing. Happy to be an early customer if the fit is right.',
    aiScore: 82,
    aiReason: 'Concrete early-customer ask aligned with wants.',
    decision: 'accept',
    status: 'accepted',
    helpful: true,
    monthsAgo: 0,
    dayOffset: 5,
  },
  {
    label: 'accept-eng-collab',
    senderType: 'human',
    senderName: 'Riley Ng',
    senderContact: 'riley@example.com',
    message:
      'Senior TypeScript engineer curious about collaborating on billing edge cases — open to a scoped intro.',
    aiScore: 79,
    aiReason: 'Senior TS collab matches open asks.',
    decision: 'accept',
    status: 'delivered',
    helpful: null,
    monthsAgo: 0,
    dayOffset: 8,
  },
  {
    label: 'reject-vague',
    senderType: 'human',
    senderName: 'Alex Coffee',
    senderContact: 'alex@example.com',
    message: 'Quick sync sometime? Would love to pick your brain over coffee.',
    aiScore: 34,
    aiReason: 'Vague coffee chat without a written ask.',
    decision: 'reject',
    status: 'pending',
    helpful: null,
    monthsAgo: 0,
    dayOffset: 3,
  },
  {
    label: 'spam-crypto',
    senderType: 'human',
    senderName: 'Token Bro',
    senderContact: 'gm@tokens.example',
    message: 'Hot crypto NFT drop — promote our token to your SaaS audience!!',
    aiScore: 8,
    aiReason: 'Deal-breaker crypto/NFT pitch.',
    decision: 'spam',
    status: 'pending',
    helpful: null,
    monthsAgo: 0,
    dayOffset: 1,
  },
  {
    label: 'accept-agent',
    senderType: 'agent',
    senderName: 'ResearchBot',
    senderContact: 'ops@researchbot.example',
    message:
      'Agent for a peer founder network. Requesting async intro about open problems in usage-based SaaS billing.',
    aiScore: 76,
    aiReason: 'Agent request with specific billing topic.',
    decision: 'accept',
    status: 'accepted',
    helpful: true,
    monthsAgo: 1,
    dayOffset: 4,
  },
  {
    label: 'reject-agency',
    senderType: 'human',
    senderName: 'SEO Blast',
    senderContact: 'hello@seo.example',
    message: 'We can rank your site #1 with our SEO agency package — partnership opportunity.',
    aiScore: 18,
    aiReason: 'Agency blast; weak fit.',
    decision: 'reject',
    status: 'pending',
    helpful: null,
    monthsAgo: 1,
    dayOffset: 10,
  },
  {
    label: 'spam-agency',
    senderType: 'human',
    senderName: 'Lead Gen Co',
    senderContact: 'sales@leads.example',
    message: 'Guaranteed leads from our SEO agency — crypto-ready growth engine.',
    aiScore: 5,
    aiReason: 'Spam agency + crypto signals.',
    decision: 'spam',
    status: 'pending',
    helpful: null,
    monthsAgo: 1,
    dayOffset: 12,
  },
  {
    label: 'accept-last-month',
    senderType: 'human',
    senderName: 'Jordan Lee',
    senderContact: 'jordan@example.com',
    message:
      'Indie SaaS founder here — shipping metered billing. Wanted a peer intro on founder-led sales.',
    aiScore: 85,
    aiReason: 'Peer founder sales note.',
    decision: 'accept',
    status: 'accepted',
    helpful: false,
    monthsAgo: 1,
    dayOffset: 18,
  },
  {
    label: 'accept-two-months',
    senderType: 'human',
    senderName: 'Samir Ali',
    senderContact: 'samir@example.com',
    message:
      'Building B2B SaaS billing internals in TypeScript. Would value a short peer comparison intro.',
    aiScore: 80,
    aiReason: 'Strong technical peer fit.',
    decision: 'accept',
    status: 'accepted',
    helpful: true,
    monthsAgo: 2,
    dayOffset: 6,
  },
  {
    label: 'reject-two-months',
    senderType: 'human',
    senderName: 'Pat Vague',
    senderContact: 'pat@example.com',
    message: 'Partnership opportunity — let’s hop on a quick sync next week.',
    aiScore: 28,
    aiReason: 'Vague partnership ask.',
    decision: 'reject',
    status: 'pending',
    helpful: null,
    monthsAgo: 2,
    dayOffset: 14,
  },
  {
    label: 'spam-two-months',
    senderType: 'agent',
    senderName: 'ShillBot',
    senderContact: 'bot@shill.example',
    message: 'Automated NFT mint promo for your audience. Token launch Friday.',
    aiScore: 3,
    aiReason: 'Automated NFT/token spam.',
    decision: 'spam',
    status: 'pending',
    helpful: null,
    monthsAgo: 2,
    dayOffset: 20,
  },
];

function demoCreatedAt(monthsAgo: number, dayOffset: number): Date {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - monthsAgo);
  d.setUTCDate(Math.max(1, Math.min(28, dayOffset)));
  d.setUTCHours(14, 30, 0, 0);
  return d;
}

async function upsertUser(
  db: ReturnType<typeof createDb>,
  demo: (typeof DEMO_USERS)[number],
): Promise<string> {
  const [existing] = await db.select().from(users).where(eq(users.handle, demo.handle)).limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        name: demo.name,
        email: demo.email,
        bio: demo.bio,
        wantsText: demo.wantsText,
        offersText: demo.offersText,
        neverText: demo.neverText,
      })
      .where(eq(users.id, existing.id));
    console.log(`updated @${demo.handle}`);
    return existing.id;
  }

  const [created] = await db
    .insert(users)
    .values({
      handle: demo.handle,
      name: demo.name,
      email: demo.email,
      bio: demo.bio,
      wantsText: demo.wantsText,
      offersText: demo.offersText,
      neverText: demo.neverText,
    })
    .returning({ id: users.id });
  console.log(`created @${demo.handle}`);
  return created!.id;
}

async function seedDemoRequests(db: ReturnType<typeof createDb>, demoUserId: string): Promise<void> {
  // Clear all @demo requests then re-insert labeled set (idempotent seed).
  await db.delete(requests).where(eq(requests.targetUserId, demoUserId));

  for (const row of DEMO_REQUESTS) {
    await db.insert(requests).values({
      senderType: row.senderType,
      senderName: row.senderName,
      senderContact: row.senderContact,
      targetUserId: demoUserId,
      message: `[demo:${row.label}] ${row.message}`,
      aiScore: row.aiScore,
      aiReason: row.aiReason,
      decision: row.decision,
      status: row.status,
      helpful: row.helpful,
      createdAt: demoCreatedAt(row.monthsAgo, row.dayOffset),
    });
  }

  console.log(`seeded ${DEMO_REQUESTS.length} labeled requests for @demo`);
}

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required to seed');
  }

  const db = createDb(url);
  let demoUserId: string | null = null;

  for (const demo of DEMO_USERS) {
    const userId = await upsertUser(db, demo);

    await db
      .insert(gateRules)
      .values({
        userId,
        ruleText: demo.ruleText,
        minRelevance: demo.minRelevance,
      })
      .onConflictDoUpdate({
        target: gateRules.userId,
        set: {
          ruleText: demo.ruleText,
          minRelevance: demo.minRelevance,
        },
      });

    if (demo.handle === 'demo') {
      demoUserId = userId;
    }
  }

  if (demoUserId) {
    await seedDemoRequests(db, demoUserId);
  }

  console.log(
    `Seeded ${DEMO_USERS.length} demo users: ${DEMO_USERS.map((u) => `@${u.handle}`).join(', ')}`,
  );
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
