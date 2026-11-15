import { gateRules, requests, users } from '@gatekeeper/db';
import { and, eq, gte } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { z } from 'zod';

import { logAbuse } from './abuse-log.js';
import { getDb } from './db.js';
import { createEmailSender } from './email.js';
import { judgeRequest } from './judge.js';
import { createLlm } from './llm.js';
import {
  sendOwnerNotificationEmail,
  sendRejectEmailToSender,
  shouldSendInstantOwnerEmail,
  statusAfterJudgment,
} from './opt-in.js';
import {
  canEmailSenderContact,
  consumeSenderOutboundSlot,
  isSenderContactVerified,
  maybeSendSenderVerificationEmail,
} from './sender-verify.js';
import {
  forfeitStakeToReceiver,
  holdSenderStake,
  paymentsEnabled,
  refundStake,
  stakeCentsFromEnv,
} from './payments.js';
import { DEDUPE_WINDOW_MS, messageDedupeHash, normalizeSenderEmail } from './request-dedupe.js';
import { MESSAGE_MAX_CHARS, NAME_MAX_CHARS } from './request-limits.js';

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
  senderName: z.string().min(1).max(NAME_MAX_CHARS),
  senderContact: z.string().min(1).max(320),
  message: z.string().min(1).max(MESSAGE_MAX_CHARS),
  /** Optional anti-spam stake in cents when PAYMENTS_ENABLED (e.g. 100 = $1). */
  stakeCents: z.number().int().min(0).max(10_000).optional(),
});

export type IntroBody = z.infer<typeof introBodySchema>;

export type SubmitRequestResult = {
  request: {
    id: string;
    status: string;
    decision: string | null;
    aiScore: number | null;
    stakeCents?: number;
    createdAt: Date;
  };
  judgment: {
    score: number;
    decision: string;
    reason_public: string;
    suggested_rewrite: string | null;
  } | null;
  email: { kind: string; id: string; mode: string } | null;
  /** Sender-facing delivery: on-screen until contact verified. */
  senderContact?: {
    verified: boolean;
    verifyEmailSent: boolean;
    onScreenOnly: boolean;
  };
  error?: string;
};

export async function submitIntroRequest(options: {
  handle: string;
  body: Omit<IntroBody, 'handle' | 'targetHandle'>;
  apiKeyId?: string | null;
  clientIp?: string | null;
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

  // 24h dedupe on (owner, sender email, normalized message hash) — no LLM.
  const senderEmail = normalizeSenderEmail(options.body.senderContact);
  const msgHash = messageDedupeHash(options.body.message);
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
  const recent = await db
    .select({
      id: requests.id,
      senderContact: requests.senderContact,
      message: requests.message,
    })
    .from(requests)
    .where(and(eq(requests.targetUserId, user.id), gte(requests.createdAt, since)))
    .limit(500);
  const duplicate = recent.find(
    (row) =>
      normalizeSenderEmail(row.senderContact) === senderEmail &&
      messageDedupeHash(row.message) === msgHash,
  );
  if (duplicate) {
    return {
      ok: false,
      status: 409,
      error: 'Duplicate request within 24 hours',
    };
  }

  const stakeCents = paymentsEnabled() ? (options.body.stakeCents ?? 0) : 0;

  if (stakeCents > 0) {
    const held = await holdSenderStake({
      senderEmail: options.body.senderContact,
      stakeCents,
    });
    if (!held.ok) {
      return { ok: false, status: 402, error: held.error };
    }
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
      stakeCents,
      status: 'pending',
    })
    .returning({
      id: requests.id,
      status: requests.status,
      createdAt: requests.createdAt,
      stakeCents: requests.stakeCents,
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
    if (stakeCents > 0) {
      await refundStake(options.body.senderContact, stakeCents);
      await db.update(requests).set({ stakeCents: 0 }).where(eq(requests.id, created!.id));
    }
    return {
      ok: true,
      result: {
        request: {
          id: created!.id,
          status: created!.status,
          decision: null,
          aiScore: null,
          stakeCents: 0,
          createdAt: created!.createdAt,
        },
        judgment: null,
        email: null,
        error: 'Judging temporarily unavailable; request saved as pending',
      },
    };
  }

  // Stake: spam → receiver credits; reject → refund; accept → held until receiver opt-in.
  if (stakeCents > 0) {
    if (judgment.decision === 'spam') {
      await forfeitStakeToReceiver({
        receiverEmail: user.email,
        stakeCents,
      });
    } else if (judgment.decision !== 'accept') {
      await refundStake(options.body.senderContact, stakeCents);
      await db.update(requests).set({ stakeCents: 0 }).where(eq(requests.id, created!.id));
    }
  }

  const nextStatus = statusAfterJudgment(judgment.decision);
  const [updated] = await db
    .update(requests)
    .set({
      aiScore: judgment.score,
      aiReason: judgment.reason_private,
      aiReasonPublic: judgment.reason_public,
      decision: judgment.decision,
      status: nextStatus,
    })
    .where(eq(requests.id, created!.id))
    .returning({
      id: requests.id,
      status: requests.status,
      decision: requests.decision,
      aiScore: requests.aiScore,
      stakeCents: requests.stakeCents,
      createdAt: requests.createdAt,
    });

  if (judgment.decision === 'spam') {
    await logAbuse({
      kind: 'spam_decision',
      ip: options.clientIp,
      apiKeyId: options.apiKeyId,
      targetUserId: user.id,
      detail: `request_id=${created!.id} score=${judgment.score}`,
      log: options.log,
    });
  }

  const send = createEmailSender();
  let email: { kind: string; id: string; mode: string } | null = null;
  let verifyEmailSent = false;

  try {
    if (shouldSendInstantOwnerEmail(user.notificationEmailMode)) {
      const ownerMail = await sendOwnerNotificationEmail(send, {
        receiverEmail: user.email,
        receiverName: user.name,
        senderName: options.body.senderName,
        senderType: options.body.senderType,
        message: options.body.message,
        score: judgment.score,
        decision: judgment.decision,
        reasonPublic: judgment.reason_public,
        requestId: created!.id,
      });
      email = { kind: 'owner_notification', id: ownerMail.id, mode: ownerMail.mode };
    }

    // Never email unverified senderContact (reject/etc). On-screen only until verify.
    const senderGate = await canEmailSenderContact(options.body.senderContact);
    if (judgment.decision !== 'accept' && senderGate.ok) {
      const slot = consumeSenderOutboundSlot(options.body.senderContact);
      if (slot.ok) {
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
        if (!email) {
          email = { kind: 'sender_reject', id: result.id, mode: result.mode };
        }
      }
    } else if (!senderGate.ok && senderGate.reason === 'unverified') {
      const verify = await maybeSendSenderVerificationEmail(send, {
        senderEmail: options.body.senderContact,
        senderName: options.body.senderName,
      });
      verifyEmailSent = verify.sent;
      if (verify.sent && !email) {
        email = { kind: 'sender_verify', id: verify.id!, mode: verify.mode! };
      }
    }
  } catch (error) {
    options.log?.error({ err: error }, 'request notification email failed');
  }

  const verified = await isSenderContactVerified(options.body.senderContact);

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
      senderContact: {
        verified,
        verifyEmailSent,
        onScreenOnly: !verified,
      },
    },
  };
}

export function defaultStakeCents(): number {
  return stakeCentsFromEnv();
}
