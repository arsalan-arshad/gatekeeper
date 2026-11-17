import { users } from '@gatekeeper/db';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { getDb } from '../db.js';
import { escapeHtml } from '../email-templates.js';
import { verifyIntroContactVerifyToken } from '../tokens.js';

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

/**
 * Completes user-scoped ownership proof for an alternate intro contact email.
 * Token binds (userId, email); global verified_senders is never consulted.
 */
export async function registerIntroContactVerifyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/intro-contact/verify', async (request, reply) => {
    reply.header('X-Robots-Tag', 'noindex, nofollow');
    const query = request.query as { token?: string };
    const token = typeof query.token === 'string' ? query.token : '';
    if (!token) {
      return reply
        .status(400)
        .type('text/html')
        .send(htmlPage('Invalid link', '<p>This confirmation link is missing a token.</p>'));
    }

    const verified = verifyIntroContactVerifyToken(token);
    if (!verified.ok) {
      return reply
        .status(400)
        .type('text/html')
        .send(htmlPage('Invalid link', `<p>${escapeHtml(verified.error)}.</p>`));
    }

    const db = getDb();
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, verified.payload.userId))
      .limit(1);
    if (!user) {
      return reply
        .status(404)
        .type('text/html')
        .send(htmlPage('Not found', '<p>Account not found.</p>'));
    }

    const current = user.introContactEmail?.trim().toLowerCase() || null;
    if (!current || current !== verified.payload.email) {
      return reply
        .status(409)
        .type('text/html')
        .send(
          htmlPage(
            'Email changed',
            '<p>This confirmation no longer matches your saved intro email. Update it in Settings and request a new link.</p>',
          ),
        );
    }

    await db
      .update(users)
      .set({ introContactVerifiedAt: new Date() })
      .where(and(eq(users.id, user.id), eq(users.introContactEmail, verified.payload.email)));

    return reply
      .type('text/html')
      .send(
        htmlPage(
          'Intro email confirmed',
          '<p>This address is now verified for Gatekeeper intros. You can close this tab.</p>',
        ),
      );
  });
}
