import { ledgerStats, requests, users } from '@gatekeeper/db';
import { desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { getDb } from '../db.js';
import { formatMonthLabel, summarizeLedgerMonths, type LedgerMonthRow } from '../ledger.js';
import { verifyHelpfulToken } from '../tokens.js';

function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>${title}</title>
<style>
  body{font-family:IBM Plex Sans,system-ui,sans-serif;background:#0f1419;color:#f4f1ea;
  max-width:40rem;margin:4rem auto;padding:0 1.25rem;line-height:1.5}
  a{color:#3dd6c6}
</style></head><body>${body}</body></html>`;
}

function mapMonthRows(
  rows: Array<{
    month: Date;
    requestCount: number;
    deliveredCount: number;
    acceptedCount: number;
    spamCount: number;
    helpfulCount: number;
    acceptRate: number;
  }>,
): LedgerMonthRow[] {
  return rows.map((row) => ({
    month: formatMonthLabel(row.month),
    requestCount: row.requestCount,
    deliveredCount: row.deliveredCount,
    acceptedCount: row.acceptedCount,
    spamCount: row.spamCount,
    helpfulCount: row.helpfulCount,
    acceptRate: Number(row.acceptRate),
  }));
}

export async function registerLedgerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/ledger', async () => {
    const db = getDb();

    const monthRows = await db
      .select({
        month: ledgerStats.month,
        requestCount: sql<number>`sum(${ledgerStats.requestCount})::int`,
        deliveredCount: sql<number>`sum(${ledgerStats.deliveredCount})::int`,
        acceptedCount: sql<number>`sum(${ledgerStats.acceptedCount})::int`,
        spamCount: sql<number>`sum(${ledgerStats.spamCount})::int`,
        helpfulCount: sql<number>`sum(${ledgerStats.helpfulCount})::int`,
        acceptRate: sql<number>`
          CASE WHEN sum(${ledgerStats.requestCount}) = 0 THEN 0
          ELSE sum(${ledgerStats.deliveredCount})::float8 / sum(${ledgerStats.requestCount})::float8
          END
        `,
      })
      .from(ledgerStats)
      .groupBy(ledgerStats.month)
      .orderBy(desc(ledgerStats.month));

    const months = mapMonthRows(monthRows);
    const totals = summarizeLedgerMonths(months);

    return { scope: 'global' as const, totals, months };
  });

  app.get('/v1/users/:handle/ledger', async (request, reply) => {
    const { handle } = request.params as { handle: string };
    const db = getDb();

    const [user] = await db
      .select({ id: users.id, handle: users.handle, name: users.name })
      .from(users)
      .where(eq(users.handle, handle.toLowerCase()))
      .limit(1);

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const monthRows = await db
      .select({
        month: ledgerStats.month,
        requestCount: ledgerStats.requestCount,
        deliveredCount: ledgerStats.deliveredCount,
        acceptedCount: ledgerStats.acceptedCount,
        spamCount: ledgerStats.spamCount,
        helpfulCount: ledgerStats.helpfulCount,
        acceptRate: ledgerStats.acceptRate,
      })
      .from(ledgerStats)
      .where(eq(ledgerStats.targetUserId, user.id))
      .orderBy(desc(ledgerStats.month));

    const months = mapMonthRows(monthRows);
    const totals = summarizeLedgerMonths(months);

    return {
      scope: 'user' as const,
      user: { handle: user.handle, name: user.name },
      totals,
      months,
    };
  });

  app.get('/v1/requests/:id/helpful', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { helpful?: string; token?: string };
    const helpful = query.helpful === 'true' ? true : query.helpful === 'false' ? false : null;
    const token = query.token;

    if (helpful === null || !token) {
      return reply
        .status(400)
        .type('text/html')
        .send(htmlPage('Invalid link', '<p>This helpfulness link is missing parameters.</p>'));
    }

    const verified = verifyHelpfulToken(token, { requestId: id, helpful });
    if (!verified.ok) {
      return reply
        .status(400)
        .type('text/html')
        .send(htmlPage('Invalid link', `<p>${verified.error}.</p>`));
    }

    const db = getDb();
    const [row] = await db.select().from(requests).where(eq(requests.id, id)).limit(1);
    if (!row) {
      return reply
        .status(404)
        .type('text/html')
        .send(htmlPage('Not found', '<p>Request not found.</p>'));
    }

    if (row.status !== 'accepted') {
      return reply
        .status(409)
        .type('text/html')
        .send(htmlPage('Unavailable', '<p>Only completed intros can be rated.</p>'));
    }

    if (row.helpful !== null) {
      return reply
        .type('text/html')
        .send(
          htmlPage(
            'Already rated',
            `<p>Thanks — this intro was already marked as ${row.helpful ? 'helpful' : 'not helpful'}.</p>`,
          ),
        );
    }

    await db.update(requests).set({ helpful }).where(eq(requests.id, id));

    return reply
      .type('text/html')
      .send(
        htmlPage(
          'Thanks',
          helpful
            ? '<p>Thanks — marked as helpful. This feeds the public trust score.</p>'
            : '<p>Thanks — noted as not helpful. This feeds the public trust score.</p>',
        ),
      );
  });
}
