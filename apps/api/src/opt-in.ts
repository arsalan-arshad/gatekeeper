import type { EmailSender } from './email.js';
import {
  buildDeclineAutoReplyEmail,
  buildIntroEmail,
  buildOwnerNotificationEmail,
  buildReceiverOptInEmail,
  buildRejectEmail,
} from './email-templates.js';
import type { JudgeDecision, JudgeResult } from './judge.js';
import {
  canEmailSenderContact,
  consumeSenderOutboundSlot,
  maybeSendSenderVerificationEmail,
} from './sender-verify.js';
import { createHelpfulToken, createOptInToken } from './tokens.js';

export function getPublicBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.API_URL ?? env.APP_URL ?? 'http://localhost:4000').replace(/\/$/, '');
}

export function getAppBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

export function buildOptInLinks(
  requestId: string,
  env: NodeJS.ProcessEnv = process.env,
): { acceptUrl: string; declineUrl: string } {
  const base = getPublicBaseUrl(env);
  const accept = createOptInToken({ requestId, action: 'accept' }, { env });
  const decline = createOptInToken({ requestId, action: 'decline' }, { env });
  return {
    acceptUrl: `${base}/v1/requests/${requestId}/respond?action=accept&token=${encodeURIComponent(accept)}`,
    declineUrl: `${base}/v1/requests/${requestId}/respond?action=decline&token=${encodeURIComponent(decline)}`,
  };
}

export async function sendReceiverOptInEmail(
  send: EmailSender,
  input: {
    receiverEmail: string;
    receiverName: string;
    senderName: string;
    senderType: string;
    message: string;
    score: number;
    requestId: string;
    env?: NodeJS.ProcessEnv;
  },
) {
  const { acceptUrl, declineUrl } = buildOptInLinks(input.requestId, input.env);
  const content = buildReceiverOptInEmail({
    receiverName: input.receiverName,
    senderName: input.senderName,
    senderType: input.senderType,
    message: input.message,
    score: input.score,
    acceptUrl,
    declineUrl,
    env: input.env,
  });
  return send({ to: input.receiverEmail, ...content });
}

/** Notify the owner about any judged request (respect notification_email_mode upstream). */
export async function sendOwnerNotificationEmail(
  send: EmailSender,
  input: {
    receiverEmail: string;
    receiverName: string;
    senderName: string;
    senderType: string;
    message: string;
    score: number;
    decision: string;
    reasonPublic: string;
    requestId: string;
    env?: NodeJS.ProcessEnv;
  },
) {
  const { acceptUrl, declineUrl } = buildOptInLinks(input.requestId, input.env);
  const inboxUrl = `${getAppBaseUrl(input.env)}/dashboard?filter=${encodeURIComponent(input.decision)}`;
  const content = buildOwnerNotificationEmail({
    receiverName: input.receiverName,
    senderName: input.senderName,
    senderType: input.senderType,
    message: input.message,
    score: input.score,
    decision: input.decision,
    reasonPublic: input.reasonPublic,
    approveUrl: acceptUrl,
    declineUrl,
    inboxUrl,
    env: input.env,
  });
  return send({ to: input.receiverEmail, ...content });
}

export async function sendRejectEmailToSender(
  send: EmailSender,
  input: {
    senderEmail: string;
    senderName: string;
    receiverName: string;
    judgment: Pick<JudgeResult, 'reason_public' | 'suggested_rewrite' | 'decision'>;
    env?: NodeJS.ProcessEnv;
  },
) {
  const content = buildRejectEmail({
    senderName: input.senderName,
    receiverName: input.receiverName,
    decision: input.judgment.decision,
    reasonPublic: input.judgment.reason_public,
    suggestedRewrite: input.judgment.suggested_rewrite,
    env: input.env,
  });
  return send({ to: input.senderEmail, ...content });
}

export async function sendDeclineAutoReply(
  send: EmailSender,
  input: {
    senderEmail: string;
    senderName: string;
    receiverName: string;
    env?: NodeJS.ProcessEnv;
  },
) {
  const gate = await canEmailSenderContact(input.senderEmail);
  if (!gate.ok) {
    if (gate.reason === 'unverified') {
      await maybeSendSenderVerificationEmail(send, {
        senderEmail: input.senderEmail,
        senderName: input.senderName,
        env: input.env,
      });
    }
    return { id: 'skipped-unverified-sender', mode: 'console' as const };
  }
  const slot = await consumeSenderOutboundSlot(input.senderEmail);
  if (!slot.ok) {
    return { id: 'skipped-outbound-cap', mode: 'console' as const };
  }
  const content = buildDeclineAutoReplyEmail({
    senderName: input.senderName,
    receiverName: input.receiverName,
    env: input.env,
  });
  return send({ to: input.senderEmail, ...content });
}

export function buildHelpfulLinks(
  requestId: string,
  env: NodeJS.ProcessEnv = process.env,
): { yesUrl: string; noUrl: string } {
  const base = getPublicBaseUrl(env);
  const yes = createHelpfulToken({ requestId, helpful: true }, { env });
  const no = createHelpfulToken({ requestId, helpful: false }, { env });
  return {
    yesUrl: `${base}/v1/requests/${requestId}/helpful?helpful=true&token=${encodeURIComponent(yes)}`,
    noUrl: `${base}/v1/requests/${requestId}/helpful?helpful=false&token=${encodeURIComponent(no)}`,
  };
}

export async function sendIntroEmailToBoth(
  send: EmailSender,
  input: {
    receiverEmail: string;
    receiverName: string;
    senderEmail: string;
    senderName: string;
    message: string;
    requestId: string;
    env?: NodeJS.ProcessEnv;
  },
) {
  const { yesUrl, noUrl } = buildHelpfulLinks(input.requestId, input.env);
  const content = buildIntroEmail({
    receiverName: input.receiverName,
    receiverEmail: input.receiverEmail,
    senderName: input.senderName,
    senderEmail: input.senderEmail,
    message: input.message,
    yesUrl,
    noUrl,
    env: input.env,
  });

  const gate = await canEmailSenderContact(input.senderEmail);
  if (!gate.ok) {
    if (gate.reason === 'unverified') {
      await maybeSendSenderVerificationEmail(send, {
        senderEmail: input.senderEmail,
        senderName: input.senderName,
        env: input.env,
      });
    }
    // Owner/receiver still gets the intro; never CC unverified senderContact.
    return send({ to: [input.receiverEmail], ...content });
  }
  const slot = await consumeSenderOutboundSlot(input.senderEmail);
  if (!slot.ok) {
    return send({ to: [input.receiverEmail], ...content });
  }
  return send({
    to: [input.receiverEmail, input.senderEmail],
    ...content,
  });
}

export function statusAfterJudgment(decision: JudgeDecision): 'delivered' | 'pending' {
  return decision === 'accept' ? 'delivered' : 'pending';
}

export function shouldSendInstantOwnerEmail(
  mode: 'instant' | 'daily_digest' | 'off' | null | undefined,
): boolean {
  return (mode ?? 'instant') === 'instant';
}
