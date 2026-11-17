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
 * Usage (prod — export DATABASE_URL first; do not rely on root `.env` auto-load):
 *   # dry-run (default)
 *   DATABASE_URL='postgresql://…' pnpm --filter @gatekeeper/db db:delete-user -- arsalan-a-software-engin
 *
 *   # apply
 *   DATABASE_URL='postgresql://…' pnpm --filter @gatekeeper/db db:delete-user -- arsalan-a-software-engin --yes
 *
 * The `--` after the script name is required by pnpm so the handle is passed
 * through. A lone `--` in argv (from that separator) is ignored.
 *
 * Or run the companion SQL:
 *   packages/db/scripts/delete-handle-arsalan-a-software-engin.sql
 */
import { eq, inArray } from 'drizzle-orm';

import { authAccounts, authSessions, authUsers, authVerificationTokens } from './auth-schema.js';
import { DELETE_USER_USAGE, parseArgs } from './delete-user-args.js';
import { createDb } from './index.js';
import { users } from './schema.js';

async function main() {
  const { handle, yes, help } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(DELETE_USER_USAGE);
    process.exit(0);
  }
  if (!handle) {
    throw new Error(DELETE_USER_USAGE);
  }

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'DATABASE_URL is required (export it before running; root .env is not auto-loaded).\n' +
        DELETE_USER_USAGE,
    );
  }

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
