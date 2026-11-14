import { users } from '@gatekeeper/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { logAbuse } from '../abuse-log.js';
import { getDb } from '../db.js';
import { checkIpRateLimit } from '../rate-limit.js';
import { MESSAGE_MAX_CHARS } from '../request-limits.js';
import { submitIntroRequest } from '../submit-request.js';

const publicIntroSchema = z.object({
  senderType: z.enum(['human', 'agent']).default('human'),
  senderName: z.string().min(1).max(120),
  senderContact: z.string().min(1).max(320),
  message: z.string().min(1).max(MESSAGE_MAX_CHARS),
});

function clientIp(request: { ip: string; headers: Record<string, unknown> }): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || request.ip;
  }
  return request.ip;
}

export async function registerPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/users/:handle', async (request, reply) => {
    const { handle } = request.params as { handle: string };
    const db = getDb();
    const [user] = await db
      .select({
        handle: users.handle,
        name: users.name,
        bio: users.bio,
        wantsText: users.wantsText,
        offersText: users.offersText,
      })
      .from(users)
      .where(eq(users.handle, handle.toLowerCase()))
      .limit(1);

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Never expose private gate rules on the public profile.
    return { user };
  });

  app.post('/v1/users/:handle/requests', async (request, reply) => {
    const ip = clientIp(request);
    const ipLimit = checkIpRateLimit(ip);
    if (!ipLimit.ok) {
      await logAbuse({
        kind: 'rate_limit_ip',
        ip,
        detail: `public_intro reset_ms=${ipLimit.resetMs}`,
        log: request.log,
      });
      reply.header('retry-after', Math.ceil(ipLimit.resetMs / 1000));
      return reply
        .status(429)
        .send({ error: 'IP rate limit exceeded', retry_after_ms: ipLimit.resetMs });
    }

    const { handle } = request.params as { handle: string };
    const parsed = publicIntroSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Invalid intro request', details: parsed.error.flatten() });
    }

    const outcome = await submitIntroRequest({
      handle,
      body: parsed.data,
      clientIp: ip,
      log: request.log,
    });

    if (!outcome.ok) {
      return reply.status(outcome.status).send({ error: outcome.error });
    }

    return outcome.result;
  });
}
