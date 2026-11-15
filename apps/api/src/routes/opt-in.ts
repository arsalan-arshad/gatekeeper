import { requests, users } from '@gatekeeper/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { getDb } from '../db.js';
import { createEmailSender } from '../email.js';
import { sendDeclineAutoReply, sendIntroEmailToBoth } from '../opt-in.js';
import { refundStake, settleAcceptedIntro } from '../payments.js';
import { verifyOptInToken, type OptInAction } from '../tokens.js';

function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>${title}</title>
<style>
  body{font-family:IBM Plex Sans,system-ui,sans-serif;background:#0f1419;color:#f4f1ea;
  max-width:40rem;margin:4rem auto;padding:0 1.25rem;line-height:1.5}
  a{color:#3dd6c6}
</style></head><body>${body}</body></html>`;
}

export async function registerOptInRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/requests/:id/respond', async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { action?: string; token?: string };
    const action = query.action === 'accept' || query.action === 'decline' ? query.action : null;
    const token = query.token;

    if (!action || !token) {
      return reply
        .status(400)
        .type('text/html')
        .send(htmlPage('Invalid link', '<p>This Gatekeeper link is missing parameters.</p>'));
    }

    const verified = verifyOptInToken(token, { requestId: id, action: action as OptInAction });
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

    if (row.status === 'accepted' || row.status === 'declined') {
      return reply
        .type('text/html')
        .send(
          htmlPage(
            'Already handled',
            `<p>This intro was already marked <strong>${row.status}</strong>.</p>`,
          ),
        );
    }

    const [receiver] = await db.select().from(users).where(eq(users.id, row.targetUserId)).limit(1);
    if (!receiver) {
      return reply
        .status(404)
        .type('text/html')
        .send(htmlPage('Not found', '<p>Receiver profile missing.</p>'));
    }

    // Owner may Approve/Decline from notification links even when AI rejected —
    // keep AI verdict/score/reason; record owner_decision separately.
    if (action === 'decline') {
      if (row.stakeCents > 0) {
        await refundStake(row.senderContact, row.stakeCents);
      }
      await db
        .update(requests)
        .set({ ownerDecision: 'reject', status: 'declined', stakeCents: 0 })
        .where(eq(requests.id, id));

      const send = createEmailSender();
      try {
        await sendDeclineAutoReply(send, {
          senderEmail: row.senderContact,
          senderName: row.senderName,
          receiverName: receiver.name,
        });
      } catch (error) {
        request.log.error({ err: error }, 'decline auto-reply failed');
      }

      return reply
        .type('text/html')
        .send(
          htmlPage(
            'Declined',
            '<p>Declined. A polite auto-reply was sent. Thanks for keeping your Gatekeeper sharp.</p>',
          ),
        );
    }

    await db
      .update(requests)
      .set({ ownerDecision: 'accept', status: 'delivered' })
      .where(eq(requests.id, id));

    const settlement = await settleAcceptedIntro({
      senderEmail: row.senderContact,
      stakeCents: row.stakeCents,
    });
    if (!settlement.ok) {
      return reply
        .status(402)
        .type('text/html')
        .send(
          htmlPage(
            'Payment required',
            `<p>Could not complete the intro: ${settlement.error}. Ask the sender to buy credits, then try Accept again.</p>`,
          ),
        );
    }

    const send = createEmailSender();
    await sendIntroEmailToBoth(send, {
      receiverEmail: receiver.email,
      receiverName: receiver.name,
      senderEmail: row.senderContact,
      senderName: row.senderName,
      message: row.message,
      requestId: id,
    });

    await db
      .update(requests)
      .set({ ownerDecision: 'accept', status: 'accepted', stakeCents: 0 })
      .where(eq(requests.id, id));

    return reply
      .type('text/html')
      .send(
        htmlPage(
          'Intro sent',
          `<p>Accepted. Gatekeeper emailed you and <strong>${row.senderName}</strong> a shared intro.</p>`,
        ),
      );
  });
}
