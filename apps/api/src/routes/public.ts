import { requests, users } from '@gatekeeper/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { getDb } from '../db.js';

const introSchema = z.object({
  senderType: z.enum(['human', 'agent']).default('human'),
  senderName: z.string().min(1).max(120),
  senderContact: z.string().min(1).max(320),
  message: z.string().min(1).max(5000),
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
    const { handle } = request.params as { handle: string };
    const parsed = introSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Invalid intro request', details: parsed.error.flatten() });
    }

    const db = getDb();
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.handle, handle.toLowerCase()))
      .limit(1);

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const [created] = await db
      .insert(requests)
      .values({
        senderType: parsed.data.senderType,
        senderName: parsed.data.senderName,
        senderContact: parsed.data.senderContact,
        targetUserId: user.id,
        message: parsed.data.message,
        status: 'pending',
      })
      .returning({ id: requests.id, status: requests.status, createdAt: requests.createdAt });

    // Judging (accept/reject/spam) lands in Step 5.
    return { request: created };
  });
}
