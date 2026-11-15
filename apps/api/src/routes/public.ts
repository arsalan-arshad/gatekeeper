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

/**
 * Public form guards: resolve handle first so missing profiles 404 without
 * consuming the shared IP quota.
 */
export async function guardPublicFormRequest(input: {
  handle: string;
  ip: string;
  senderContact: string;
  lookupOwner: (handle: string) => Promise<{ id: string } | null>;
  checkIp?: typeof checkPublicFormIpRateLimit;
  checkSender?: typeof checkPublicFormSenderOwnerRateLimit;
}): Promise<
  | { ok: true; ownerId: string }
  | { ok: false; status: 404 | 429; error: string; retry_after_ms?: number; detail?: string }
> {
  const checkIp = input.checkIp ?? checkPublicFormIpRateLimit;
  const checkSender = input.checkSender ?? checkPublicFormSenderOwnerRateLimit;

  const owner = await input.lookupOwner(input.handle.toLowerCase());
  if (!owner) {
    return { ok: false, status: 404, error: 'User not found' };
  }

  const ipLimit = await checkIp(input.ip);
  if (!ipLimit.ok) {
    return {
      ok: false,
      status: 429,
      error: 'IP rate limit exceeded',
      retry_after_ms: ipLimit.resetMs,
      detail: `public_form_ip reset_ms=${ipLimit.resetMs}`,
    };
  }

  const senderLimit = await checkSender(input.senderContact, owner.id);
  if (!senderLimit.ok) {
    return {
      ok: false,
      status: 429,
      error: 'Sender rate limit exceeded for this Gatekeeper',
      retry_after_ms: senderLimit.resetMs,
      detail: `public_form_sender reset_ms=${senderLimit.resetMs}`,
    };
  }

  return { ok: true, ownerId: owner.id };
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
    const { handle } = request.params as { handle: string };
    const parsed = publicIntroSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Invalid intro request', details: parsed.error.flatten() });
    }

    const db = getDb();
    const gate = await guardPublicFormRequest({
      handle,
      ip,
      senderContact: parsed.data.senderContact,
      lookupOwner: async (h) => {
        const [owner] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.handle, h))
          .limit(1);
        return owner ?? null;
      },
    });

    if (!gate.ok) {
      if (gate.status === 429) {
        await logAbuse({
          kind: 'rate_limit_ip',
          ip,
          detail: gate.detail ?? gate.error,
          log: request.log,
        });
        reply.header('retry-after', retryAfterSeconds(gate.retry_after_ms ?? 1000));
        return reply.status(429).send({
          error: gate.error,
          retry_after_ms: gate.retry_after_ms,
        });
      }
      return reply.status(404).send({ error: gate.error });
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
