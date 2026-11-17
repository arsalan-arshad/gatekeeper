import { gateRules, users } from '@gatekeeper/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { getDb } from '../db.js';
import {
  INTERVIEW_QUESTIONS,
  buildProfileEmbeddingText,
  synthesizeProfile,
  type InterviewAnswers,
} from '../interview.js';
import { createLlm } from '../llm.js';
import { HANDLE_TAKEN_ERROR, replyForHandleClaimError } from '../pg-errors.js';

const answersSchema = z.object({
  who: z.string().min(1),
  want: z.string().min(1),
  never: z.string().min(1),
  dealbreakers: z.string().min(1),
  format: z.string().min(1),
});

const completeSchema = z.object({
  email: z.string().email(),
  handle: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(120),
  bio: z.string().max(1000).optional(),
  wantsText: z.string().max(2000).optional(),
  offersText: z.string().max(2000).optional(),
  neverText: z.string().max(2000).optional(),
  ruleText: z.string().min(1).max(8000),
  minRelevance: z.number().int().min(0).max(100).optional(),
});

export async function registerOnboardingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/onboarding/questions', async () => ({
    questions: INTERVIEW_QUESTIONS,
  }));

  app.post('/v1/onboarding/synthesize', async (request, reply) => {
    const parsed = answersSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Invalid interview answers', details: parsed.error.flatten() });
    }

    const answers = parsed.data as InterviewAnswers;
    let llm;
    try {
      llm = createLlm({ maxRetries: 1 });
    } catch {
      llm = undefined;
    }

    const profile = await synthesizeProfile(answers, llm);
    return { profile };
  });

  app.get('/v1/onboarding/me', async (request, reply) => {
    const email = request.gatekeeperEmail;
    if (!email) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    // Same response shape for unknown vs known (no enumeration via missing keys).
    if (!user) {
      return { onboarded: false as const, user: null, gateRules: null };
    }

    const [rules] = await db.select().from(gateRules).where(eq(gateRules.userId, user.id)).limit(1);
    return {
      onboarded: true as const,
      user: {
        id: user.id,
        handle: user.handle,
        name: user.name,
        email: user.email,
        bio: user.bio,
        wantsText: user.wantsText,
        offersText: user.offersText,
        neverText: user.neverText,
      },
      gateRules: rules ? { ruleText: rules.ruleText, minRelevance: rules.minRelevance } : null,
    };
  });

  app.post('/v1/onboarding/complete', async (request, reply) => {
    const emailHeader = request.gatekeeperEmail ?? null;
    const parsed = completeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const body = parsed.data;
    if (!emailHeader || emailHeader !== body.email.toLowerCase()) {
      return reply.status(401).send({ error: 'Email does not match signed-in user' });
    }

    const db = getDb();
    const handle = body.handle.toLowerCase();

    const [handleTaken] = await db.select().from(users).where(eq(users.handle, handle)).limit(1);
    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.email, body.email.toLowerCase()))
      .limit(1);

    if (handleTaken && handleTaken.email !== body.email.toLowerCase()) {
      return reply.status(409).send({ error: HANDLE_TAKEN_ERROR });
    }

    let embedding: number[] | null = null;
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
        { userId: existing?.id ?? body.email },
      );
    } catch {
      embedding = null;
    }

    const values = {
      handle,
      name: body.name,
      email: body.email.toLowerCase(),
      bio: body.bio ?? null,
      wantsText: body.wantsText ?? null,
      offersText: body.offersText ?? null,
      neverText: body.neverText ?? null,
      profileEmbedding: embedding,
    };

    let userId: string;
    try {
      if (existing) {
        const [updated] = await db
          .update(users)
          .set(values)
          .where(eq(users.id, existing.id))
          .returning({ id: users.id });
        userId = updated!.id;
      } else {
        const [created] = await db.insert(users).values(values).returning({ id: users.id });
        userId = created!.id;
      }
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
        userId,
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

    return {
      user: { id: userId, handle, name: body.name, email: body.email.toLowerCase() },
      embeddingStored: embedding !== null,
    };
  });
}
