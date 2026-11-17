/**
 * Idempotent embedding backfill.
 *
 * Usage:
 *   pnpm --filter @gatekeeper/api backfill:embeddings -- --dry-run
 *   pnpm --filter @gatekeeper/api backfill:embeddings -- --limit 50
 *
 * Processes rows where profile_embedding IS NULL, or opted-in users missing
 * wants/offers embeddings. Throttles ~1 embed/sec. Stops cleanly on 429.
 * Logs user UUIDs only — never emails or names.
 *
 * Not run automatically on Railway start.
 */
import { gateRules, users } from '@gatekeeper/db';
import { and, eq, isNull, or } from 'drizzle-orm';

import { getDb } from '../db.js';
import {
  buildOffersEmbeddingText,
  buildProfileEmbeddingText,
  buildWantsEmbeddingText,
} from '../interview.js';
import { createLlm } from '../llm.js';

function parseArgs(argv: string[]) {
  let dryRun = false;
  let limit = 50;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') dryRun = true;
    if (arg === '--limit') {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n) && n > 0) limit = Math.floor(n);
      i += 1;
    }
  }
  return { dryRun, limit };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimited(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /429|RESOURCE_EXHAUSTED|rate.?limit/i.test(msg);
}

async function main(): Promise<void> {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));
  const db = getDb();

  const rows = await db
    .select()
    .from(users)
    .where(
      or(
        isNull(users.profileEmbedding),
        and(
          eq(users.directoryOptIn, true),
          or(isNull(users.wantsEmbedding), isNull(users.offersEmbedding)),
        ),
      ),
    )
    .limit(limit);

  console.log(
    JSON.stringify({
      event: 'backfill_start',
      dryRun,
      limit,
      candidates: rows.length,
    }),
  );

  if (dryRun) {
    for (const row of rows) {
      console.log(JSON.stringify({ event: 'backfill_would_touch', userId: row.id }));
    }
    console.log(JSON.stringify({ event: 'backfill_dry_run_done', count: rows.length }));
    return;
  }

  const llm = createLlm({ maxRetries: 0 });
  let updated = 0;
  let stoppedOn429 = false;

  for (const row of rows) {
    try {
      let profileEmbedding = row.profileEmbedding;
      if (!profileEmbedding) {
        const [rules] = await db
          .select({ ruleText: gateRules.ruleText })
          .from(gateRules)
          .where(eq(gateRules.userId, row.id))
          .limit(1);
        profileEmbedding = await llm.embed(
          buildProfileEmbeddingText({
            name: row.name,
            bio: row.bio,
            wantsText: row.wantsText,
            offersText: row.offersText,
            neverText: row.neverText,
            ruleText: rules?.ruleText ?? '',
          }),
          { userId: row.id },
        );
        await sleep(1000);
      }

      let wantsEmbedding = row.wantsEmbedding;
      let offersEmbedding = row.offersEmbedding;
      let matchEmbeddingsAt = row.matchEmbeddingsAt;

      if (row.directoryOptIn && (!wantsEmbedding || !offersEmbedding)) {
        if (!wantsEmbedding) {
          wantsEmbedding = await llm.embed(
            buildWantsEmbeddingText({
              wantsText: row.wantsText,
              directoryRole: row.directoryRole,
              directoryTags: row.directoryTags,
            }),
            { userId: row.id },
          );
          await sleep(1000);
        }
        if (!offersEmbedding) {
          offersEmbedding = await llm.embed(
            buildOffersEmbeddingText({
              offersText: row.offersText,
              bio: row.bio,
              directoryRole: row.directoryRole,
              directoryTags: row.directoryTags,
            }),
            { userId: row.id },
          );
          await sleep(1000);
        }
        matchEmbeddingsAt = new Date();
      }

      await db
        .update(users)
        .set({
          profileEmbedding,
          wantsEmbedding,
          offersEmbedding,
          ...(matchEmbeddingsAt ? { matchEmbeddingsAt } : {}),
        })
        .where(eq(users.id, row.id));

      updated += 1;
      console.log(JSON.stringify({ event: 'backfill_updated', userId: row.id }));
    } catch (error) {
      if (isRateLimited(error)) {
        stoppedOn429 = true;
        console.log(
          JSON.stringify({
            event: 'backfill_stopped_rate_limit',
            userId: row.id,
            updated,
          }),
        );
        break;
      }
      console.error(
        JSON.stringify({
          event: 'backfill_error',
          userId: row.id,
          error: error instanceof Error ? error.message : 'unknown',
        }),
      );
      process.exitCode = 1;
      return;
    }
  }

  console.log(
    JSON.stringify({
      event: 'backfill_done',
      updated,
      stoppedOn429,
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
