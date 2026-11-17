import type { EmailSender } from './email.js';
import { EmailSendError } from './email.js';
import { sendDeclineAutoReply, sendIntroEmailToBoth, statusAfterJudgment } from './opt-in.js';
import {
  claimOwnerDecision,
  finalizeOwnerDecision,
  type ClaimedRequest,
  type OwnerDecisionValue,
} from './owner-decision.js';
import {
  claimOutboundEmailSlot,
  OUTBOUND_EMAIL_TYPES,
  releaseOutboundEmailSlot,
} from './outbound-email.js';
import { forfeitStakeToReceiver, refundStake, settleAcceptedIntro } from './payments.js';

export const ALREADY_DECIDED_ERROR = 'Already decided';

export type ApproveResult =
  | { ok: true; status: 'accepted'; introEmail?: 'sent' | 'failed' | 'skipped' }
  | { ok: false; status: 402 | 409; error: string };

export type DeclineResult =
  { ok: true; status: 'declined' } | { ok: false; status: 409; error: string };

export type OverrideSpamResult =
  | { ok: true; request: Pick<ClaimedRequest, 'id' | 'decision' | 'ownerDecision' | 'status'> }
  | { ok: false; status: 409; error: string };

/**
 * Concurrent-safe approve: claim owner_decision first; email only if claim + outbound slot win.
 */
export async function approveInboxRequest(input: {
  requestId: string;
  owner: { id: string; email: string; name: string };
  send: EmailSender;
}): Promise<ApproveResult> {
  const claimed = await claimOwnerDecision({
    requestId: input.requestId,
    ownerId: input.owner.id,
    ownerDecision: 'accept',
    status: 'delivered',
  });

  if (!claimed.claimed) {
    return { ok: false, status: 409, error: ALREADY_DECIDED_ERROR };
  }

  const row = claimed.row;
  const settlement = await settleAcceptedIntro({
    senderEmail: row.senderContact,
    stakeCents: row.stakeCents,
  });
  if (!settlement.ok) {
    return { ok: false, status: 402, error: settlement.error };
  }

  let introEmail: 'sent' | 'failed' | 'skipped' = 'skipped';
  const emailSlot = await claimOutboundEmailSlot({
    requestId: input.requestId,
    emailType: OUTBOUND_EMAIL_TYPES.introConnected,
  });
  if (emailSlot.claimed) {
    try {
      await sendIntroEmailToBoth(input.send, {
        receiverEmail: input.owner.email,
        receiverName: input.owner.name,
        senderEmail: row.senderContact,
        senderName: row.senderName,
        message: row.message,
        requestId: input.requestId,
        ownerId: input.owner.id,
      });
      introEmail = 'sent';
    } catch (error) {
      if (error instanceof EmailSendError) {
        await releaseOutboundEmailSlot({
          requestId: input.requestId,
          emailType: OUTBOUND_EMAIL_TYPES.introConnected,
        });
        introEmail = 'failed';
      } else {
        throw error;
      }
    }
  }

  await finalizeOwnerDecision({
    requestId: input.requestId,
    ownerId: input.owner.id,
    status: 'accepted',
    stakeCents: 0,
  });

  return { ok: true, status: 'accepted', introEmail };
}

export async function declineInboxRequest(input: {
  requestId: string;
  owner: { id: string; email: string; name: string };
  send: EmailSender;
}): Promise<DeclineResult> {
  // Keep stake on the claimed row so we can refund the pre-claim amount.
  const claimed = await claimOwnerDecision({
    requestId: input.requestId,
    ownerId: input.owner.id,
    ownerDecision: 'reject',
    status: 'declined',
  });

  if (!claimed.claimed) {
    return { ok: false, status: 409, error: ALREADY_DECIDED_ERROR };
  }

  const row = claimed.row;
  if (row.stakeCents > 0) {
    await refundStake(row.senderContact, row.stakeCents);
  }

  const emailSlot = await claimOutboundEmailSlot({
    requestId: input.requestId,
    emailType: OUTBOUND_EMAIL_TYPES.declineAutoReply,
  });
  if (emailSlot.claimed) {
    try {
      await sendDeclineAutoReply(input.send, {
        senderEmail: row.senderContact,
        senderName: row.senderName,
        receiverName: input.owner.name,
        ownerId: input.owner.id,
      });
    } catch {
      /* logged by caller if needed */
    }
  }

  await finalizeOwnerDecision({
    requestId: input.requestId,
    ownerId: input.owner.id,
    status: 'declined',
    stakeCents: 0,
  });

  return { ok: true, status: 'declined' };
}

export async function overrideInboxRequest(input: {
  requestId: string;
  owner: { id: string; email: string; name: string };
  decision: OwnerDecisionValue;
  priorAiDecision: OwnerDecisionValue | null;
}): Promise<OverrideSpamResult> {
  const nextStatus = statusAfterJudgment(input.decision);
  const claimed = await claimOwnerDecision({
    requestId: input.requestId,
    ownerId: input.owner.id,
    ownerDecision: input.decision,
    status: nextStatus,
  });

  if (!claimed.claimed) {
    return { ok: false, status: 409, error: ALREADY_DECIDED_ERROR };
  }

  const row = claimed.row;
  if (input.decision === 'spam' && row.stakeCents > 0) {
    await forfeitStakeToReceiver({
      receiverEmail: input.owner.email,
      stakeCents: row.stakeCents,
    });
  } else if (
    input.decision !== 'accept' &&
    row.stakeCents > 0 &&
    input.priorAiDecision === 'accept'
  ) {
    await refundStake(row.senderContact, row.stakeCents);
  }

  const nextStake = input.decision === 'accept' ? row.stakeCents : 0;
  if (nextStake !== row.stakeCents) {
    await finalizeOwnerDecision({
      requestId: input.requestId,
      ownerId: input.owner.id,
      status: nextStatus,
      stakeCents: nextStake,
    });
  }

  return {
    ok: true,
    request: {
      id: row.id,
      decision: row.decision,
      ownerDecision: input.decision,
      status: nextStatus,
    },
  };
}

export async function markSpamInboxRequest(input: {
  requestId: string;
  owner: { id: string; email: string; name: string };
}): Promise<OverrideSpamResult> {
  const claimed = await claimOwnerDecision({
    requestId: input.requestId,
    ownerId: input.owner.id,
    ownerDecision: 'spam',
    status: 'declined',
  });

  if (!claimed.claimed) {
    return { ok: false, status: 409, error: ALREADY_DECIDED_ERROR };
  }

  const row = claimed.row;
  if (row.stakeCents > 0) {
    await forfeitStakeToReceiver({
      receiverEmail: input.owner.email,
      stakeCents: row.stakeCents,
    });
  }

  await finalizeOwnerDecision({
    requestId: input.requestId,
    ownerId: input.owner.id,
    status: 'declined',
    stakeCents: 0,
  });

  return {
    ok: true,
    request: {
      id: row.id,
      decision: row.decision,
      ownerDecision: 'spam',
      status: 'declined',
    },
  };
}
