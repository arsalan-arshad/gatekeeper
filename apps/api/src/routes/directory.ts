import { users } from '@gatekeeper/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';

import { logAbuse } from '../abuse-log.js';
import { clientIp, rateLimitIpBucket } from '../client-ip.js';
import { getDb } from '../db.js';
import {
  DIRECTORY_ROLE_MAX,
  directoryQuerySchema,
  directoryUpdateSchema,
  findMemoryDirectoryByEmailForTests,
  listDirectory,
  parseDirectoryTagsQuery,
  updateMemoryDirectoryUserForTests,
  validateDirectoryTags,
} from '../directory.js';
import { computeMatchEmbeddings } from '../match-embeddings.js';
import { consumePostgresRateLimit, retryAfterSeconds } from '../rate-limit.js';

const DIRECTORY_IP_LIMIT = 60;
const DIRECTORY_IP_WINDOW_MS = 60_000;

async function loadOwnerByEmail(email: string) {
  const memory = findMemoryDirectoryByEmailForTests(email);
  if (memory) return memory;
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user ?? null;
}

export async function registerDirectoryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/directory', async (request, reply) => {
    const ip = clientIp(request);
    const bucket = rateLimitIpBucket(ip);
    const limit = await consumePostgresRateLimit(
      `directory-ip:${bucket}`,
      DIRECTORY_IP_LIMIT,
      DIRECTORY_IP_WINDOW_MS,
    );
    if (!limit.ok) {
      await logAbuse({
        kind: 'rate_limit_ip',
        ip,
        detail: `directory_ip reset_ms=${limit.resetMs}`,
        log: request.log,
      });
      reply.header('retry-after', retryAfterSeconds(limit.resetMs));
      return reply.status(429).send({
        error: 'IP rate limit exceeded',
        retry_after_ms: limit.resetMs,
      });
    }

    const rawQuery = request.query as Record<string, unknown>;
    const parsed = directoryQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid query', details: parsed.error.flatten() });
    }

    const tagsParsed = parseDirectoryTagsQuery(parsed.data.tag);
    if (!tagsParsed.ok) {
      return reply.status(400).send({ error: tagsParsed.error });
    }

    if (parsed.data.cursor && !parsed.data.cursor.trim()) {
      return reply.status(400).send({ error: 'Invalid cursor' });
    }

    const hasFilters = Boolean(
      parsed.data.q?.trim() ||
      parsed.data.role?.trim() ||
      tagsParsed.tags.length > 0 ||
      parsed.data.want?.trim() ||
      parsed.data.cursor?.trim(),
    );

    const result = await listDirectory({
      q: parsed.data.q?.trim() || undefined,
      role: parsed.data.role?.trim() || undefined,
      tags: tagsParsed.tags,
      want: parsed.data.want?.trim() || undefined,
      cursor: parsed.data.cursor?.trim() || undefined,
      limit: parsed.data.limit,
    });

    if (!hasFilters) {
      reply.header('cache-control', 'public, max-age=60');
    }

    return {
      results: result.results,
      nextCursor: result.nextCursor,
    };
  });

  app.get('/v1/dashboard/directory', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });

    const user = await loadOwnerByEmail(email);
    if (!user) return reply.status(404).send({ error: 'Complete onboarding first' });

    return {
      directoryOptIn: user.directoryOptIn,
      directoryRole: user.directoryRole ?? null,
      directoryTags: user.directoryTags ?? [],
      directoryPromptDismissed: Boolean(
        'directoryPromptDismissedAt' in user
          ? user.directoryPromptDismissedAt
          : (user as { directoryPromptDismissedAt?: Date | null }).directoryPromptDismissedAt,
      ),
      directoryOptInAt:
        'directoryOptInAt' in user && user.directoryOptInAt
          ? user.directoryOptInAt instanceof Date
            ? user.directoryOptInAt.toISOString()
            : user.directoryOptInAt
          : null,
    };
  });

  app.put('/v1/dashboard/directory', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });

    const parsed = directoryUpdateSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const user = await loadOwnerByEmail(email);
    if (!user) return reply.status(404).send({ error: 'Complete onboarding first' });

    const body = parsed.data;
    let tags = user.directoryTags ?? [];
    if (body.tags !== undefined) {
      const validated = validateDirectoryTags(body.tags);
      if (!validated.ok) {
        return reply.status(400).send({ error: validated.error });
      }
      tags = validated.tags;
    }

    let role = user.directoryRole ?? null;
    if (body.role !== undefined) {
      const trimmed = body.role?.trim() || null;
      if (trimmed && trimmed.length > DIRECTORY_ROLE_MAX) {
        return reply.status(400).send({ error: 'Role too long' });
      }
      role = trimmed;
    }

    const now = new Date();
    const optIn = body.optIn;
    const patch = {
      directoryOptIn: optIn,
      directoryOptInAt: optIn
        ? user.directoryOptIn
          ? ((user as { directoryOptInAt?: Date | null }).directoryOptInAt ?? now)
          : now
        : null,
      directoryRole: role,
      directoryTags: tags,
      directoryPromptDismissedAt: body.dismissPrompt
        ? now
        : ((user as { directoryPromptDismissedAt?: Date | null }).directoryPromptDismissedAt ??
          null),
      updatedAt: now,
    };

    // Always bind target to session owner — never from body/URL (IDOR).
    const memoryUpdated = updateMemoryDirectoryUserForTests(user.id, patch);
    if (!memoryUpdated) {
      const db = getDb();
      const needsMatchEmbeds =
        patch.directoryOptIn &&
        (!(user as { wantsEmbedding?: number[] | null }).wantsEmbedding ||
          !(user as { offersEmbedding?: number[] | null }).offersEmbedding);
      let matchPatch: Record<string, unknown> = {};
      if (needsMatchEmbeds) {
        const full = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
        const row = full[0];
        if (row) {
          const embeds = await computeMatchEmbeddings({
            userId: row.id,
            fields: {
              wantsText: row.wantsText,
              offersText: row.offersText,
              bio: row.bio,
              directoryRole: patch.directoryRole,
              directoryTags: patch.directoryTags,
            },
            previousWants: row.wantsEmbedding,
            previousOffers: row.offersEmbedding,
          });
          matchPatch = {
            wantsEmbedding: embeds.wantsEmbedding,
            offersEmbedding: embeds.offersEmbedding,
            ...(embeds.matchEmbeddingsAt ? { matchEmbeddingsAt: embeds.matchEmbeddingsAt } : {}),
          };
        }
      }
      await db
        .update(users)
        .set({
          directoryOptIn: patch.directoryOptIn,
          directoryOptInAt: patch.directoryOptInAt,
          directoryRole: patch.directoryRole,
          directoryTags: patch.directoryTags,
          directoryPromptDismissedAt: patch.directoryPromptDismissedAt,
          updatedAt: patch.updatedAt,
          ...matchPatch,
        })
        .where(eq(users.id, user.id));
    }

    return {
      ok: true,
      directoryOptIn: patch.directoryOptIn,
      directoryRole: patch.directoryRole,
      directoryTags: patch.directoryTags,
      directoryPromptDismissed: Boolean(patch.directoryPromptDismissedAt),
    };
  });
}
