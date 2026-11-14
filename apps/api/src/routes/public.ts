import { gateRules, requests, users } from '@gatekeeper/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { getDb } from '../db.js';
import { createEmailSender } from '../email.js';
import { judgeRequest } from '../judge.js';
import { createLlm } from '../llm.js';
import { sendReceiverOptInEmail, sendRejectEmailToSender, statusAfterJudgment } from '../opt-in.js';

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
      .select()
      .from(users)
      .where(eq(users.handle, handle.toLowerCase()))
      .limit(1);

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    const [rules] = await db.select().from(gateRules).where(eq(gateRules.userId, user.id)).limit(1);
    if (!rules) {
      return reply.status(409).send({ error: 'User has not finished onboarding' });
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
      .returning({
        id: requests.id,
        status: requests.status,
        createdAt: requests.createdAt,
      });

    let judgment;
    try {
      const llm = createLlm({ maxRetries: 1 });
      judgment = await judgeRequest(
        {
          message: parsed.data.message,
          senderName: parsed.data.senderName,
          senderType: parsed.data.senderType,
          senderContact: parsed.data.senderContact,
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
    } catch (error) {
      request.log.error({ err: error }, 'judgeRequest failed');
      return {
        request: created,
        judgment: null,
        error: 'Judging temporarily unavailable; request saved as pending',
      };
    }

    const nextStatus = statusAfterJudgment(judgment.decision);
    const [updated] = await db
      .update(requests)
      .set({
        aiScore: judgment.score,
        aiReason: judgment.reason_private,
        decision: judgment.decision,
        status: nextStatus,
      })
      .where(eq(requests.id, created!.id))
      .returning({
        id: requests.id,
        status: requests.status,
        decision: requests.decision,
        aiScore: requests.aiScore,
        createdAt: requests.createdAt,
      });

    const send = createEmailSender();
    let email: { kind: string; id: string; mode: string } | null = null;

    try {
      if (judgment.decision === 'accept') {
        const result = await sendReceiverOptInEmail(send, {
          receiverEmail: user.email,
          receiverName: user.name,
          senderName: parsed.data.senderName,
          senderType: parsed.data.senderType,
          message: parsed.data.message,
          score: judgment.score,
          requestId: created!.id,
        });
        email = { kind: 'receiver_opt_in', id: result.id, mode: result.mode };
      } else {
        const result = await sendRejectEmailToSender(send, {
          senderEmail: parsed.data.senderContact,
          senderName: parsed.data.senderName,
          receiverName: user.name,
          judgment: {
            decision: judgment.decision,
            reason_public: judgment.reason_public,
            suggested_rewrite: judgment.suggested_rewrite,
          },
        });
        email = { kind: 'sender_reject', id: result.id, mode: result.mode };
      }
    } catch (error) {
      request.log.error({ err: error }, 'opt-in email failed');
    }

    // Public response: never include reason_private or gate rules.
    return {
      request: updated,
      judgment: {
        score: judgment.score,
        decision: judgment.decision,
        reason_public: judgment.reason_public,
        suggested_rewrite: judgment.suggested_rewrite,
      },
      email,
    };
  });
}
