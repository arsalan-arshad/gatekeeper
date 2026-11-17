import { introMatches, users } from '@gatekeeper/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { resolveIntroContactEmail } from '../contact-email.js';
import { getDb } from '../db.js';
import { createEmailSender } from '../email.js';
import { escapeHtml } from '../email-templates.js';
import { claimMatchDecision, writeMatchDismissalsBothWays } from '../match-decision.js';
import { sendMatchIntroEmail } from '../match-intro.js';
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

function publicSummary(user: {
  name: string;
  directoryRole: string | null;
  offersText: string | null;
  bio: string | null;
}): string {
  return [user.name, user.directoryRole, user.offersText || user.bio]
    .filter(Boolean)
    .join(' — ')
    .slice(0, 280);
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
        const copy =
          result.reason === 'expired'
            ? 'This intro request has expired.'
            : 'This intro request was already decided.';
        return reply
          .status(409)
          .type('text/html')
          .send(htmlPage('Already decided', `<p>${copy}</p>`));
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
      const copy =
        result.reason === 'expired'
          ? 'This intro request has expired.'
          : 'This intro request was already decided.';
      return reply
        .status(409)
        .type('text/html')
        .send(htmlPage('Already decided', `<p>${copy}</p>`));
    }

    captureServerEvent(recipient.id, 'match_accepted', {
      score_band: scoreBandFromSimilarity(result.row.similarity),
    });

    const [requester] = await db
      .select()
      .from(users)
      .where(eq(users.id, result.row.requesterId))
      .limit(1);

    let introEmail: 'sent' | 'failed' | 'skipped' = 'failed';
    if (requester) {
      introEmail = await sendMatchIntroEmail({
        send: createEmailSender(),
        matchId: result.row.id,
        note: result.row.note,
        personA: {
          name: requester.name,
          contactEmail: resolveIntroContactEmail(requester),
          summary: publicSummary(requester),
        },
        personB: {
          name: recipient.name,
          contactEmail: resolveIntroContactEmail(recipient),
          summary: publicSummary(recipient),
        },
      });
    }

    if (introEmail === 'failed') {
      return reply
        .type('text/html')
        .send(
          htmlPage(
            'Accepted',
            '<p>Intro accepted, but we could not send the connection email right now. Open your Gatekeeper dashboard and use <strong>Resend intro email</strong>.</p>',
          ),
        );
    }

    return reply
      .type('text/html')
      .send(
        htmlPage(
          'Accepted',
          '<p>Intro accepted. Check your email for the connection — just hit Reply-all to continue.</p>',
        ),
      );
  });
}
