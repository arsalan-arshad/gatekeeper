import {
  authAccounts,
  authSessions,
  authUsers,
  authVerificationTokens,
  gateRules,
  requests,
  users,
} from '@gatekeeper/db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import {
  ALREADY_DECIDED_ERROR,
  approveInboxRequest,
  declineInboxRequest,
  markSpamInboxRequest,
  overrideInboxRequest,
} from '../approve-request.js';
import { getDb } from '../db.js';
import { createEmailSender } from '../email.js';
import { judgeRequest } from '../judge.js';
import { createLlm } from '../llm.js';
import {
  INTERVIEW_QUESTIONS,
  buildProfileEmbeddingText,
  synthesizeProfile,
  type InterviewAnswers,
} from '../interview.js';
import { countInboxFilters, matchesInboxFilter, type InboxFilter } from '../inbox-status.js';
import { computeMatchEmbeddings } from '../match-embeddings.js';
import { HANDLE_TAKEN_ERROR, replyForHandleClaimError } from '../pg-errors.js';

const filterSchema = z.enum(['all', 'accepted', 'rejected', 'spam']).default('all');

const rulesUpdateSchema = z.object({
  name: z.string().min(1).max(120),
  bio: z.string().max(1000).optional(),
  handle: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9-]+$/),
  wantsText: z.string().max(2000).optional(),
  offersText: z.string().max(2000).optional(),
  neverText: z.string().max(2000).optional(),
  ruleText: z.string().min(1).max(8000),
  minRelevance: z.number().int().min(0).max(100).optional(),
});

const testMessageSchema = z.object({
  message: z.string().min(1).max(2000),
  senderName: z.string().min(1).max(100).optional(),
});

const settingsSchema = z.object({
  notificationEmailMode: z.enum(['instant', 'daily_digest', 'off']),
});

const overrideSchema = z.object({
  decision: z.enum(['accept', 'reject', 'spam']),
});

async function loadOwner(email: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user ?? null;
}

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/dashboard/inbox', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });

    const query = request.query as { filter?: string };
    const filter = filterSchema.catch('all').parse(query.filter ?? 'all');

    const user = await loadOwner(email);
    if (!user) return reply.status(404).send({ error: 'Complete onboarding first' });

    const db = getDb();
    const rows = await db
      .select({
        id: requests.id,
        senderName: requests.senderName,
        senderContact: requests.senderContact,
        senderType: requests.senderType,
        message: requests.message,
        decision: requests.decision,
        ownerDecision: requests.ownerDecision,
        status: requests.status,
        aiScore: requests.aiScore,
        aiReasonPublic: requests.aiReasonPublic,
        createdAt: requests.createdAt,
      })
      .from(requests)
      .where(eq(requests.targetUserId, user.id))
      .orderBy(desc(requests.createdAt))
      .limit(200);

    const inboxFilter = filter as InboxFilter;
    const filtered = rows.filter((row) => matchesInboxFilter(row, inboxFilter));
    const counts = countInboxFilters(rows);

    return {
      filter,
      counts,
      items: filtered.map((row) => ({
        id: row.id,
        senderName: row.senderName,
        senderContact: row.senderContact,
        senderType: row.senderType,
        message: row.message,
        decision: row.decision,
        ownerDecision: row.ownerDecision,
        status: row.status,
        score: row.aiScore,
        reason: row.aiReasonPublic,
        createdAt: row.createdAt,
      })),
    };
  });

  app.post('/v1/dashboard/inbox/:id/approve', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const user = await loadOwner(email);
    if (!user) return reply.status(404).send({ error: 'Complete onboarding first' });

    const db = getDb();
    const [row] = await db
      .select({ id: requests.id })
      .from(requests)
      .where(and(eq(requests.id, id), eq(requests.targetUserId, user.id)))
      .limit(1);
    if (!row) return reply.status(404).send({ error: 'Request not found' });

    // Conditional UPDATE … WHERE owner_decision IS NULL; email only if claim wins.
    const result = await approveInboxRequest({
      requestId: id,
      owner: { id: user.id, email: user.email, name: user.name },
      send: createEmailSender(),
    });
    if (!result.ok) {
      return reply.status(result.status).send({ error: result.error });
    }
    return { ok: true, status: result.status };
  });

  app.post('/v1/dashboard/inbox/:id/decline', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const user = await loadOwner(email);
    if (!user) return reply.status(404).send({ error: 'Complete onboarding first' });

    const db = getDb();
    const [row] = await db
      .select({ id: requests.id })
      .from(requests)
      .where(and(eq(requests.id, id), eq(requests.targetUserId, user.id)))
      .limit(1);
    if (!row) return reply.status(404).send({ error: 'Request not found' });

    const result = await declineInboxRequest({
      requestId: id,
      owner: { id: user.id, email: user.email, name: user.name },
      send: createEmailSender(),
    });
    if (!result.ok) {
      return reply.status(result.status).send({ error: result.error ?? ALREADY_DECIDED_ERROR });
    }
    return { ok: true, status: result.status };
  });

  app.post('/v1/dashboard/inbox/:id/override', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const parsed = overrideSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid decision', details: parsed.error.flatten() });
    }

    const user = await loadOwner(email);
    if (!user) return reply.status(404).send({ error: 'Complete onboarding first' });

    const db = getDb();
    const [row] = await db
      .select({ id: requests.id, decision: requests.decision })
      .from(requests)
      .where(and(eq(requests.id, id), eq(requests.targetUserId, user.id)))
      .limit(1);
    if (!row) return reply.status(404).send({ error: 'Request not found' });

    const result = await overrideInboxRequest({
      requestId: id,
      owner: { id: user.id, email: user.email, name: user.name },
      decision: parsed.data.decision,
      priorAiDecision: row.decision,
    });
    if (!result.ok) {
      return reply.status(result.status).send({ error: result.error });
    }
    return { ok: true, request: result.request };
  });

  app.post('/v1/dashboard/inbox/:id/spam', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const user = await loadOwner(email);
    if (!user) return reply.status(404).send({ error: 'Complete onboarding first' });

    const db = getDb();
    const [row] = await db
      .select({ id: requests.id, status: requests.status })
      .from(requests)
      .where(and(eq(requests.id, id), eq(requests.targetUserId, user.id)))
      .limit(1);
    if (!row) return reply.status(404).send({ error: 'Request not found' });
    if (row.status === 'accepted') {
      return reply.status(409).send({ error: 'Cannot mark an accepted intro as spam' });
    }

    const result = await markSpamInboxRequest({
      requestId: id,
      owner: { id: user.id, email: user.email, name: user.name },
    });
    if (!result.ok) {
      return reply.status(result.status).send({ error: result.error });
    }
    return { ok: true, request: result.request };
  });

  app.get('/v1/dashboard/rules', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });

    const user = await loadOwner(email);
    if (!user) return reply.status(404).send({ error: 'Complete onboarding first' });

    const db = getDb();
    const [rules] = await db.select().from(gateRules).where(eq(gateRules.userId, user.id)).limit(1);
    return {
      user: {
        id: user.id,
        handle: user.handle,
        name: user.name,
        email: user.email,
        bio: user.bio,
        wantsText: user.wantsText,
        offersText: user.offersText,
        neverText: user.neverText,
        plan: user.plan,
        notificationEmailMode: user.notificationEmailMode,
      },
      gateRules: rules ? { ruleText: rules.ruleText, minRelevance: rules.minRelevance } : null,
      interviewQuestions: INTERVIEW_QUESTIONS,
    };
  });

  app.put('/v1/dashboard/rules', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });

    const parsed = rulesUpdateSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const user = await loadOwner(email);
    if (!user) return reply.status(404).send({ error: 'Complete onboarding first' });

    const body = parsed.data;
    const handle = body.handle.toLowerCase();
    const db = getDb();

    const [handleTaken] = await db.select().from(users).where(eq(users.handle, handle)).limit(1);
    if (handleTaken && handleTaken.id !== user.id) {
      return reply.status(409).send({ error: HANDLE_TAKEN_ERROR });
    }

    let embedding: number[] | null = user.profileEmbedding;
    try {
      const llm = createLlm({ maxRetries: 1 });
      embedding = await llm.embed(
        buildProfileEmbeddingText({
          name: body.name,
          bio: body.bio,
          wantsText: body.wantsText,
          offersText: body.offersText,
          neverText: body.neverText,
          ruleText: body.ruleText,
        }),
        { userId: user.id },
      );
    } catch {
      /* keep previous embedding */
    }

    const matchEmbeds = await computeMatchEmbeddings({
      userId: user.id,
      fields: {
        wantsText: body.wantsText,
        offersText: body.offersText,
        bio: body.bio,
        directoryRole: user.directoryRole,
        directoryTags: user.directoryTags ?? [],
      },
      previousWants: user.wantsEmbedding,
      previousOffers: user.offersEmbedding,
    });

    try {
      await db
        .update(users)
        .set({
          handle,
          name: body.name,
          bio: body.bio ?? null,
          wantsText: body.wantsText ?? null,
          offersText: body.offersText ?? null,
          neverText: body.neverText ?? null,
          profileEmbedding: embedding,
          wantsEmbedding: matchEmbeds.wantsEmbedding,
          offersEmbedding: matchEmbeds.offersEmbedding,
          ...(matchEmbeds.matchEmbeddingsAt
            ? { matchEmbeddingsAt: matchEmbeds.matchEmbeddingsAt }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    } catch (error) {
      const conflict = replyForHandleClaimError(error);
      if (conflict) {
        return reply.status(conflict.status).send(conflict.body);
      }
      throw error;
    }

    await db
      .insert(gateRules)
      .values({
        userId: user.id,
        ruleText: body.ruleText,
        minRelevance: body.minRelevance ?? 70,
      })
      .onConflictDoUpdate({
        target: gateRules.userId,
        set: {
          ruleText: body.ruleText,
          minRelevance: body.minRelevance ?? 70,
        },
      });

    return { ok: true, handle };
  });

  app.post('/v1/dashboard/rules/test', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });

    const parsed = testMessageSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const user = await loadOwner(email);
    if (!user) return reply.status(404).send({ error: 'Complete onboarding first' });

    const db = getDb();
    const [rules] = await db.select().from(gateRules).where(eq(gateRules.userId, user.id)).limit(1);
    if (!rules) return reply.status(409).send({ error: 'No rules saved yet' });

    try {
      const llm = createLlm({ maxRetries: 1 });
      const judgment = await judgeRequest(
        {
          message: parsed.data.message,
          senderName: parsed.data.senderName ?? 'Test sender',
          senderType: 'human',
          senderContact: 'test@example.com',
          userId: user.id,
          target: {
            profileEmbedding: user.profileEmbedding,
            ruleText: rules.ruleText,
            minRelevance: rules.minRelevance,
            name: user.name,
            wantsText: user.wantsText,
            neverText: user.neverText,
          },
        },
        llm,
      );
      return {
        judgment: {
          score: judgment.score,
          decision: judgment.decision,
          reason_public: judgment.reason_public,
          suggested_rewrite: judgment.suggested_rewrite,
        },
      };
    } catch (error) {
      request.log.error({ err: error }, 'dashboard rules test failed');
      return reply.status(503).send({ error: 'Judging temporarily unavailable' });
    }
  });

  /** Draft rules with step progress metadata; client times out at ~15s. */
  app.post('/v1/dashboard/rules/draft', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });

    const answersSchema = z.object({
      who: z.string().min(1),
      want: z.string().min(1),
      never: z.string().min(1),
      dealbreakers: z.string().min(1),
      format: z.string().min(1),
    });
    const parsed = answersSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Invalid interview answers', details: parsed.error.flatten() });
    }

    const steps = [
      { id: 'parse', label: 'Reading your answers' },
      { id: 'draft', label: 'Drafting plain-English rules' },
      { id: 'polish', label: 'Polishing profile copy' },
    ];

    let llm;
    try {
      llm = createLlm({ maxRetries: 1, timeoutMs: 12_000 });
    } catch {
      llm = undefined;
    }

    const started = Date.now();
    const profile = await synthesizeProfile(parsed.data as InterviewAnswers, llm);
    return {
      profile,
      steps,
      elapsedMs: Date.now() - started,
    };
  });

  app.get('/v1/dashboard/settings', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });

    const user = await loadOwner(email);
    if (!user) return reply.status(404).send({ error: 'Complete onboarding first' });

    return {
      notificationEmailMode: user.notificationEmailMode,
      email: user.email,
      handle: user.handle,
      directoryOptIn: user.directoryOptIn,
      directoryRole: user.directoryRole,
      directoryTags: user.directoryTags ?? [],
      directoryPromptDismissed: Boolean(user.directoryPromptDismissedAt),
    };
  });

  app.put('/v1/dashboard/settings', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });

    const parsed = settingsSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const user = await loadOwner(email);
    if (!user) return reply.status(404).send({ error: 'Complete onboarding first' });

    const db = getDb();
    await db
      .update(users)
      .set({ notificationEmailMode: parsed.data.notificationEmailMode })
      .where(eq(users.id, user.id));

    return { ok: true, notificationEmailMode: parsed.data.notificationEmailMode };
  });

  app.get('/v1/dashboard/export', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });

    const user = await loadOwner(email);
    if (!user) return reply.status(404).send({ error: 'Complete onboarding first' });

    const db = getDb();
    const [rules] = await db.select().from(gateRules).where(eq(gateRules.userId, user.id)).limit(1);
    const inbox = await db
      .select({
        id: requests.id,
        senderName: requests.senderName,
        senderContact: requests.senderContact,
        senderType: requests.senderType,
        message: requests.message,
        decision: requests.decision,
        ownerDecision: requests.ownerDecision,
        status: requests.status,
        aiScore: requests.aiScore,
        aiReasonPublic: requests.aiReasonPublic,
        createdAt: requests.createdAt,
      })
      .from(requests)
      .where(eq(requests.targetUserId, user.id))
      .orderBy(desc(requests.createdAt));

    return {
      exportedAt: new Date().toISOString(),
      user: {
        handle: user.handle,
        name: user.name,
        email: user.email,
        bio: user.bio,
        wantsText: user.wantsText,
        offersText: user.offersText,
        neverText: user.neverText,
        plan: user.plan,
        notificationEmailMode: user.notificationEmailMode,
        directoryOptIn: user.directoryOptIn,
        directoryRole: user.directoryRole,
        directoryTags: user.directoryTags ?? [],
        directoryPromptDismissed: Boolean(user.directoryPromptDismissedAt),
      },
      gateRules: rules ?? null,
      requests: inbox,
    };
  });

  app.delete('/v1/dashboard/account', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) return reply.status(401).send({ error: 'Unauthorized' });

    const user = await loadOwner(email);
    const db = getDb();

    if (user) {
      await db.delete(users).where(eq(users.id, user.id));
    }

    // Also clear Auth.js rows for this email so magic-link sessions die.
    const authRows = await db.select().from(authUsers).where(eq(authUsers.email, email));
    const authIds = authRows.map((row) => row.id);
    if (authIds.length > 0) {
      await db.delete(authSessions).where(inArray(authSessions.userId, authIds));
      await db.delete(authAccounts).where(inArray(authAccounts.userId, authIds));
      await db.delete(authUsers).where(inArray(authUsers.id, authIds));
    }
    await db.delete(authVerificationTokens).where(eq(authVerificationTokens.identifier, email));

    return { ok: true, deleted: true };
  });
}
