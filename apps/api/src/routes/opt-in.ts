import { requests, users } from '@gatekeeper/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import {
  ALREADY_DECIDED_ERROR,
  approveInboxRequest,
  declineInboxRequest,
} from '../approve-request.js';
import { resolveIntroContactEmail } from '../contact-email.js';
import { getDb } from '../db.js';
import { createEmailSender } from '../email.js';
import { escapeHtml } from '../email-templates.js';
import { getMemoryRequestForTests, type ClaimedRequest } from '../owner-decision.js';
import { verifyOptInToken, type OptInAction } from '../tokens.js';

type RespondReceiver = {
  id: string;
  email: string;
  name: string;
  introContactEmail?: string | null;
  introContactVerifiedAt?: Date | string | null;
};

/** In-memory request+receiver for email-link respond unit tests (no DATABASE_URL). */
let memoryRespond: {
  request: ClaimedRequest;
  receiver: RespondReceiver;
} | null = null;

export function seedMemoryOptInRespondForTests(input: {
  request: ClaimedRequest;
  receiver: RespondReceiver;
}): void {
  memoryRespond = {
    request: { ...input.request },
    receiver: { ...input.receiver },
  };
}

export function resetMemoryOptInRespondForTests(): void {
  memoryRespond = null;
}

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

export async function registerOptInRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/requests/:id/respond', async (request, reply) => {
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

    const verified = verifyOptInToken(token, { requestId: id, action: action as OptInAction });
    if (!verified.ok) {
      return reply
        .status(400)
        .type('text/html')
        .send(htmlPage('Invalid link', `<p>${verified.error}.</p>`));
    }

    let row: ClaimedRequest | undefined;
    let receiver: RespondReceiver | undefined;

    if (memoryRespond && memoryRespond.request.id === id) {
      row = memoryRespond.request;
      receiver = memoryRespond.receiver;
    } else if (!process.env.DATABASE_URL) {
      const mem = getMemoryRequestForTests(id);
      if (mem) {
        row = mem;
        receiver = memoryRespond?.receiver;
      }
    } else {
      const db = getDb();
      const [dbRow] = await db.select().from(requests).where(eq(requests.id, id)).limit(1);
      row = dbRow;
      if (row) {
        const [dbReceiver] = await db
          .select()
          .from(users)
          .where(eq(users.id, row.targetUserId))
          .limit(1);
        receiver = dbReceiver;
      }
    }

    if (!row) {
      return reply
        .status(404)
        .type('text/html')
        .send(htmlPage('Not found', '<p>Request not found.</p>'));
    }

    if (!receiver || receiver.id !== row.targetUserId) {
      return reply
        .status(404)
        .type('text/html')
        .send(htmlPage('Not found', '<p>Receiver profile missing.</p>'));
    }

    const owner = {
      id: receiver.id,
      email: resolveIntroContactEmail(receiver),
      name: receiver.name,
    };
    const send = createEmailSender();

    // Owner may Approve/Decline from notification links even when AI rejected —
    // keep AI verdict/score/reason; claim owner_decision atomically.
    if (action === 'decline') {
      const result = await declineInboxRequest({ requestId: id, owner, send });
      if (!result.ok) {
        return reply
          .status(409)
          .type('text/html')
          .send(htmlPage('Already decided', `<p>${ALREADY_DECIDED_ERROR}.</p>`));
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

    const result = await approveInboxRequest({ requestId: id, owner, send });
    if (!result.ok) {
      if (result.status === 402) {
        return reply
          .status(402)
          .type('text/html')
          .send(
            htmlPage(
              'Payment required',
              `<p>Could not complete the intro: ${escapeHtml(result.error)}. Ask the sender to buy credits, then try Accept again.</p>`,
            ),
          );
      }
      return reply
        .status(409)
        .type('text/html')
        .send(htmlPage('Already decided', `<p>${ALREADY_DECIDED_ERROR}.</p>`));
    }

    if (result.introEmail === 'failed') {
      return reply
        .type('text/html')
        .send(
          htmlPage(
            'Accepted',
            "<p>Accepted, but we couldn't send the intro email right now. Open your Gatekeeper dashboard and use Resend intro email.</p>",
          ),
        );
    }

    if (result.introEmail === 'skipped') {
      return reply
        .type('text/html')
        .send(htmlPage('Accepted', '<p>Accepted. The intro email was already sent.</p>'));
    }

    return reply
      .type('text/html')
      .send(
        htmlPage(
          'Intro sent',
          `<p>Accepted. Gatekeeper emailed you and <strong>${escapeHtml(row.senderName)}</strong> a shared intro.</p>`,
        ),
      );
  });
}
