import { users } from '@gatekeeper/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { logAbuse } from '../abuse-log.js';
import { clientIp } from '../client-ip.js';
import { getDb } from '../db.js';
import {
  checkPublicFormIpRateLimit,
  checkPublicFormSenderOwnerRateLimit,
  retryAfterSeconds,
} from '../rate-limit.js';
import { MESSAGE_MAX_CHARS, NAME_MAX_CHARS } from '../request-limits.js';
import { submitIntroRequest } from '../submit-request.js';

const publicIntroSchema = z.object({
  senderType: z.enum(['human', 'agent']).default('human'),
  senderName: z.string().min(1).max(NAME_MAX_CHARS),
  senderContact: z.string().min(1).max(320),
  message: z.string().min(1).max(MESSAGE_MAX_CHARS),
});

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
    const ipLimit = await checkPublicFormIpRateLimit(ip);
    if (!ipLimit.ok) {
      await logAbuse({
        kind: 'rate_limit_ip',
        ip,
        detail: `public_form_ip reset_ms=${ipLimit.resetMs}`,
        log: request.log,
      });
      reply.header('retry-after', retryAfterSeconds(ipLimit.resetMs));
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

    const db = getDb();
    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.handle, handle.toLowerCase()))
      .limit(1);
    if (owner) {
      const senderLimit = await checkPublicFormSenderOwnerRateLimit(
        parsed.data.senderContact,
        owner.id,
      );
      if (!senderLimit.ok) {
        await logAbuse({
          kind: 'rate_limit_ip',
          ip,
          detail: `public_form_sender reset_ms=${senderLimit.resetMs}`,
          log: request.log,
        });
        reply.header('retry-after', retryAfterSeconds(senderLimit.resetMs));
        return reply.status(429).send({
          error: 'Sender rate limit exceeded for this Gatekeeper',
          retry_after_ms: senderLimit.resetMs,
        });
      }
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
