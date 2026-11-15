import { apiKeys } from '@gatekeeper/db';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { generateApiKey, hashApiKey } from '../api-keys.js';
import { getDb } from '../db.js';

const createSchema = z.object({
  rateLimit: z.number().int().min(1).max(10_000).optional(),
});

export async function registerKeyRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/api-keys', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const db = getDb();
    const rows = await db
      .select({
        id: apiKeys.id,
        ownerEmail: apiKeys.ownerEmail,
        rateLimit: apiKeys.rateLimit,
      })
      .from(apiKeys)
      .where(eq(apiKeys.ownerEmail, email))
      .orderBy(desc(apiKeys.id));

    return {
      keys: rows.map((row) => ({
        id: row.id,
        ownerEmail: row.ownerEmail,
        rateLimit: row.rateLimit,
        prefix: 'gk_',
      })),
    };
  });

  app.post('/v1/api-keys', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const parsed = createSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const rawKey = generateApiKey();
    const db = getDb();
    const [created] = await db
      .insert(apiKeys)
      .values({
        ownerEmail: email,
        hashedKey: hashApiKey(rawKey),
        rateLimit: parsed.data.rateLimit ?? 60,
      })
      .returning({
        id: apiKeys.id,
        ownerEmail: apiKeys.ownerEmail,
        rateLimit: apiKeys.rateLimit,
      });

    return {
      key: {
        id: created!.id,
        ownerEmail: created!.ownerEmail,
        rateLimit: created!.rateLimit,
        /** Shown once — store it now. */
        secret: rawKey,
      },
    };
  });

  app.delete('/v1/api-keys/:id', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const { id } = request.params as { id: string };
    const db = getDb();
    const deleted = await db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, id), eq(apiKeys.ownerEmail, email)))
      .returning({ id: apiKeys.id });

    if (deleted.length === 0) {
      return reply.status(404).send({ error: 'API key not found' });
    }

    return { deleted: true, id };
  });
}
