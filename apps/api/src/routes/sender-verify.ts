import type { FastifyInstance } from 'fastify';

import { markSenderContactVerified, verifySenderVerifyToken } from '../sender-verify.js';

export async function registerSenderVerifyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/senders/verify', async (request, reply) => {
    const query = request.query as { token?: string };
    const token = typeof query.token === 'string' ? query.token : '';
    if (!token) {
      return reply.status(400).send({ error: 'Missing token' });
    }

    const verified = verifySenderVerifyToken(token);
    if (!verified.ok) {
      return reply.status(400).send({ error: verified.error });
    }

    await markSenderContactVerified(verified.email);
    reply.type('text/html; charset=utf-8');
    return `<!doctype html><html lang="en"><body style="font-family:system-ui,sans-serif;padding:2rem;background:#07110e;color:#f4f1ea;">
      <h1>Email verified</h1>
      <p>You can now receive Gatekeeper updates at this address.</p>
    </body></html>`;
  });
}
