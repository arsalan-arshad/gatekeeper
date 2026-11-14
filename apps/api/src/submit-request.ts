import { gateRules, requests, users } from '@gatekeeper/db';
import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';

import { getDb } from './db.js';
import { createEmailSender } from './email.js';
import { judgeRequest } from './judge.js';
import { createLlm } from './llm.js';
import { sendReceiverOptInEmail, sendRejectEmailToSender, statusAfterJudgment } from './opt-in.js';

export const introBodySchema = z.object({
  handle: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9-]+$/i)
    .optional(),
  targetHandle: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9-]+$/i)
    .optional(),
  senderType: z.enum(['human', 'agent']).default('human'),
  senderName: z.string().min(1).max(120),
  senderContact: z.string().min(1).max(320),
  message: z.string().min(1).max(5000),
});

export type IntroBody = z.infer<typeof introBodySchema>;

export type SubmitRequestResult = {
  request: {
    id: string;
    status: string;
    decision: string | null;
    aiScore: number | null;
    createdAt: Date;
  };
  judgment: {
    score: number;
    decision: string;
    reason_public: string;
    suggested_rewrite: string | null;
  } | null;
  email: { kind: string; id: string; mode: string } | null;
  error?: string;
};

export async function submitIntroRequest(options: {
  handle: string;
  body: Omit<IntroBody, 'handle' | 'targetHandle'>;
  apiKeyId?: string | null;
  log?: FastifyBaseLogger;
}): Promise<
  { ok: true; result: SubmitRequestResult } | { ok: false; status: number; error: string }
> {
  const handle = options.handle.toLowerCase();
  const db = getDb();

  const [user] = await db.select().from(users).where(eq(users.handle, handle)).limit(1);
  if (!user) {
    return { ok: false, status: 404, error: 'User not found' };
  }

  const [rules] = await db.select().from(gateRules).where(eq(gateRules.userId, user.id)).limit(1);
  if (!rules) {
    return { ok: false, status: 409, error: 'User has not finished onboarding' };
  }

  const [created] = await db
    .insert(requests)
    .values({
      senderType: options.body.senderType,
      senderName: options.body.senderName,
      senderContact: options.body.senderContact,
      targetUserId: user.id,
      message: options.body.message,
      apiKeyId: options.apiKeyId ?? null,
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
        message: options.body.message,
        senderName: options.body.senderName,
        senderType: options.body.senderType,
        senderContact: options.body.senderContact,
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
    options.log?.error({ err: error }, 'judgeRequest failed');
    return {
      ok: true,
      result: {
        request: {
          id: created!.id,
          status: created!.status,
          decision: null,
          aiScore: null,
          createdAt: created!.createdAt,
        },
        judgment: null,
        email: null,
        error: 'Judging temporarily unavailable; request saved as pending',
      },
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
        senderName: options.body.senderName,
        senderType: options.body.senderType,
        message: options.body.message,
        score: judgment.score,
        requestId: created!.id,
      });
      email = { kind: 'receiver_opt_in', id: result.id, mode: result.mode };
    } else {
      const result = await sendRejectEmailToSender(send, {
        senderEmail: options.body.senderContact,
        senderName: options.body.senderName,
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
    options.log?.error({ err: error }, 'opt-in email failed');
  }

  return {
    ok: true,
    result: {
      request: updated!,
      judgment: {
        score: judgment.score,
        decision: judgment.decision,
        reason_public: judgment.reason_public,
        suggested_rewrite: judgment.suggested_rewrite,
      },
      email,
    },
  };
}
