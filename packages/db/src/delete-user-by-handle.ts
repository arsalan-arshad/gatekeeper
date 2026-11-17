/**
 * One-off / ops: delete a Gatekeeper product user by handle, cascading related
 * rows the same way as DELETE /v1/dashboard/account.
 *
 * Cascade (schema FKs on users.id):
 *   - gate_rules → ON DELETE CASCADE
 *   - requests → ON DELETE CASCADE → outbound_emails CASCADE
 *   - abuse_events.target_user_id → ON DELETE SET NULL
 *
 * Also clears Auth.js rows (`user` / `account` / `session` / `verificationToken`)
 * for the product user's email so magic-link sessions die.
 *
 * Does **not** delete billing_accounts / pro_waitlist / email_suppressions /
 * verified_senders (email-keyed, shared across senders) — same as dashboard.
 *
 * Usage (prod):
 *   # dry-run (default)
 *   DATABASE_URL='postgresql://…' pnpm --filter @gatekeeper/db db:delete-user -- arsalan-a-software-engin
 *
 *   # apply
 *   DATABASE_URL='postgresql://…' pnpm --filter @gatekeeper/db db:delete-user -- arsalan-a-software-engin --yes
 *
 * Or run the companion SQL:
 *   packages/db/scripts/delete-handle-arsalan-a-software-engin.sql
 */
import { eq, inArray } from 'drizzle-orm';

import { authAccounts, authSessions, authUsers, authVerificationTokens } from './auth-schema.js';
import { createDb } from './index.js';
import { users } from './schema.js';

function parseArgs(argv: string[]): { handle: string; yes: boolean } {
  const positional = argv.filter((a) => !a.startsWith('-'));
  const handle = positional[0]?.trim().toLowerCase();
  if (!handle) {
    throw new Error(
      'Usage: db:delete-user -- <handle> [--yes]\n' +
        '  Omit --yes for dry-run. DATABASE_URL is required.',
    );
  }
  return { handle, yes: argv.includes('--yes') };
}

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }

  const { handle, yes } = parseArgs(process.argv.slice(2));
  const db = createDb(url);

  const [row] = await db.select().from(users).where(eq(users.handle, handle)).limit(1);
  if (!row) {
    console.log(JSON.stringify({ ok: true, found: false, handle }, null, 2));
    process.exit(0);
  }

  const preview = {
    ok: true,
    found: true,
    dryRun: !yes,
    user: { id: row.id, handle: row.handle, email: row.email, name: row.name },
  };

  if (!yes) {
    console.log(JSON.stringify(preview, null, 2));
    console.error('Dry-run only. Re-run with --yes to delete.');
    process.exit(0);
  }

  await db.delete(users).where(eq(users.id, row.id));

  const email = row.email;
  const authRows = await db.select().from(authUsers).where(eq(authUsers.email, email));
  const authIds = authRows.map((a) => a.id);
  if (authIds.length > 0) {
    await db.delete(authSessions).where(inArray(authSessions.userId, authIds));
    await db.delete(authAccounts).where(inArray(authAccounts.userId, authIds));
    await db.delete(authUsers).where(inArray(authUsers.id, authIds));
  }
  await db.delete(authVerificationTokens).where(eq(authVerificationTokens.identifier, email));

  console.log(
    JSON.stringify(
      {
        ...preview,
        dryRun: false,
        deleted: true,
        authUsersCleared: authIds.length,
      },
      null,
      2,
    ),
  );
  // postgres.js keeps the pool open; exit like db:seed so --yes does not hang.
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
