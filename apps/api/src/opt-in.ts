import type { JudgeDecision, JudgeResult } from './judge.js';
import type { EmailSender } from './email.js';
import { createOptInToken } from './tokens.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function getPublicBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.API_URL ?? env.APP_URL ?? 'http://localhost:4000').replace(/\/$/, '');
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
  const preview = input.message.trim().slice(0, 600);
  const subject = `Gatekeeper: intro request from ${input.senderName}`;
  const text = [
    `Hi ${input.receiverName},`,
    '',
    `Gatekeeper scored an intro request from ${input.senderName} (${input.senderType}) at ${input.score}/100.`,
    '',
    'Message:',
    preview,
    '',
    `Accept: ${acceptUrl}`,
    `Decline: ${declineUrl}`,
    '',
    'If you Accept, Gatekeeper will email both of you a shared intro.',
  ].join('\n');

  const html = `
    <p>Hi ${escapeHtml(input.receiverName)},</p>
    <p>Gatekeeper scored an intro request from <strong>${escapeHtml(input.senderName)}</strong>
    (${escapeHtml(input.senderType)}) at <strong>${input.score}/100</strong>.</p>
    <p><strong>Message</strong></p>
    <blockquote>${escapeHtml(preview)}</blockquote>
    <p>
      <a href="${escapeHtml(acceptUrl)}">Accept intro</a>
      &nbsp;·&nbsp;
      <a href="${escapeHtml(declineUrl)}">Decline</a>
    </p>
    <p>If you Accept, Gatekeeper will email both of you a shared intro.</p>
  `;

  return send({ to: input.receiverEmail, subject, text, html });
}

export async function sendRejectEmailToSender(
  send: EmailSender,
  input: {
    senderEmail: string;
    senderName: string;
    receiverName: string;
    judgment: Pick<JudgeResult, 'reason_public' | 'suggested_rewrite' | 'decision'>;
  },
) {
  const subject = `Gatekeeper update: your intro to ${input.receiverName}`;
  const rewrite = input.judgment.suggested_rewrite?.trim();
  const text = [
    `Hi ${input.senderName},`,
    '',
    `Your intro request to ${input.receiverName} was not forwarded (${input.judgment.decision}).`,
    '',
    input.judgment.reason_public,
    rewrite ? `\nSuggested rewrite:\n${rewrite}` : '',
    '',
    'You can revise and try again from their public Gatekeeper page.',
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <p>Hi ${escapeHtml(input.senderName)},</p>
    <p>Your intro request to <strong>${escapeHtml(input.receiverName)}</strong>
    was not forwarded (${escapeHtml(input.judgment.decision)}).</p>
    <p>${escapeHtml(input.judgment.reason_public)}</p>
    ${
      rewrite
        ? `<p><strong>Suggested rewrite</strong></p><blockquote>${escapeHtml(rewrite)}</blockquote>`
        : ''
    }
    <p>You can revise and try again from their public Gatekeeper page.</p>
  `;

  return send({ to: input.senderEmail, subject, text, html });
}

export async function sendIntroEmailToBoth(
  send: EmailSender,
  input: {
    receiverEmail: string;
    receiverName: string;
    senderEmail: string;
    senderName: string;
    message: string;
  },
) {
  const subject = `Intro: ${input.senderName} ↔ ${input.receiverName}`;
  const text = [
    `You're connected via Gatekeeper.`,
    '',
    `${input.receiverName} accepted an intro with ${input.senderName}.`,
    '',
    'Original request:',
    input.message.trim(),
    '',
    `Reply-all to continue the conversation.`,
    `${input.receiverName}: ${input.receiverEmail}`,
    `${input.senderName}: ${input.senderEmail}`,
  ].join('\n');

  const html = `
    <p>You're connected via Gatekeeper.</p>
    <p><strong>${escapeHtml(input.receiverName)}</strong> accepted an intro with
    <strong>${escapeHtml(input.senderName)}</strong>.</p>
    <p><strong>Original request</strong></p>
    <blockquote>${escapeHtml(input.message.trim())}</blockquote>
    <p>Reply-all to continue.</p>
    <ul>
      <li>${escapeHtml(input.receiverName)}: ${escapeHtml(input.receiverEmail)}</li>
      <li>${escapeHtml(input.senderName)}: ${escapeHtml(input.senderEmail)}</li>
    </ul>
  `;

  return send({
    to: [input.receiverEmail, input.senderEmail],
    subject,
    text,
    html,
  });
}

export function statusAfterJudgment(decision: JudgeDecision): 'delivered' | 'pending' {
  return decision === 'accept' ? 'delivered' : 'pending';
}
