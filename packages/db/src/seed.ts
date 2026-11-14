/**
 * Demo seed data for local launch demos.
 *
 * Usage:
 *   DATABASE_URL=… pnpm --filter @gatekeeper/db db:seed
 *
 * Idempotent on handle/email — re-running updates the same demo users.
 */
import { eq } from 'drizzle-orm';

import { createDb } from './index.js';
import { gateRules, users } from './schema.js';

const DEMO_USERS = [
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

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required to seed');
  }

  const db = createDb(url);

  for (const demo of DEMO_USERS) {
    const [existing] = await db.select().from(users).where(eq(users.handle, demo.handle)).limit(1);

    let userId: string;
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
      userId = existing.id;
      console.log(`updated @${demo.handle}`);
    } else {
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
      userId = created!.id;
      console.log(`created @${demo.handle}`);
    }

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
