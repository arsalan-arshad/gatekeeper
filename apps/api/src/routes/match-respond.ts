import { introMatches, users } from '@gatekeeper/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { getDb } from '../db.js';
import { escapeHtml } from '../email-templates.js';
import { claimMatchDecision, writeMatchDismissalsBothWays } from '../match-decision.js';
import { scoreBandFromSimilarity } from '../matching.js';
import { captureServerEvent } from '../posthog.js';
import { verifyMatchToken, type MatchAction } from '../tokens.js';

function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>${title}</title>
<meta name="robots" content="noindex, nofollow"/>
<style>
  body{font-family:IBM Plex Sans,system-ui,sans-serif;background:#0f1419;color:#f4f1ea;
  max-width:40rem;margin:4rem auto;padding:0 1.25rem;line-height:1.5}
  a{color:#3dd6c6}
</style></head><body>${body}</body></html>`;
}

function withNoindex(reply: { header: (k: string, v: string) => unknown }) {
  reply.header('X-Robots-Tag', 'noindex, nofollow');
}

export async function registerMatchRespondRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/matches/:id/respond', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { action?: string; token?: string };
    const action = query.action === 'accept' || query.action === 'decline' ? query.action : null;
    const token = query.token;

    withNoindex(reply);

    if (!action || !token) {
      return reply
        .status(400)
        .type('text/html')
        .send(htmlPage('Invalid link', '<p>This Gatekeeper link is missing parameters.</p>'));
    }

    const verified = verifyMatchToken(token, {
      matchId: id,
      action: action as MatchAction,
    });
    if (!verified.ok) {
      return reply
        .status(400)
        .type('text/html')
        .send(htmlPage('Invalid link', `<p>${escapeHtml(verified.error)}.</p>`));
    }

    const db = getDb();
    const [row] = await db.select().from(introMatches).where(eq(introMatches.id, id)).limit(1);
    if (!row) {
      return reply
        .status(404)
        .type('text/html')
        .send(htmlPage('Not found', '<p>Match not found.</p>'));
    }

    const [recipient] = await db.select().from(users).where(eq(users.id, row.recipientId)).limit(1);
    if (!recipient) {
      return reply
        .status(404)
        .type('text/html')
        .send(htmlPage('Not found', '<p>Recipient profile missing.</p>'));
    }

    if (action === 'decline') {
      const result = await claimMatchDecision({
        matchId: id,
        recipientId: recipient.id,
        decision: 'reject',
        status: 'declined',
      });
      if (!result.claimed) {
        return reply
          .status(409)
          .type('text/html')
          .send(htmlPage('Already decided', '<p>This intro request was already decided.</p>'));
      }
      await writeMatchDismissalsBothWays({
        userA: result.row.requesterId,
        userB: result.row.recipientId,
      });
      return reply
        .type('text/html')
        .send(htmlPage('Declined', '<p>Intro declined. No email was sent to the requester.</p>'));
    }

    const result = await claimMatchDecision({
      matchId: id,
      recipientId: recipient.id,
      decision: 'accept',
      status: 'accepted',
    });
    if (!result.claimed) {
      return reply
        .status(409)
        .type('text/html')
        .send(htmlPage('Already decided', '<p>This intro request was already decided.</p>'));
    }

    captureServerEvent(recipient.id, 'match_accepted', {
      score_band: scoreBandFromSimilarity(result.row.similarity),
    });

    return reply
      .type('text/html')
      .send(
        htmlPage(
          'Accepted',
          '<p>Intro accepted. Check your email for the connection (or retry from the dashboard if it did not arrive).</p>',
        ),
      );
  });
}
