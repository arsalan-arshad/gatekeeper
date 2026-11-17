import { sanitizeEmailSubject } from './email-subject.js';

export type EmailBrandLinks = {
  appUrl: string;
  settingsUrl: string;
  studioUrl: string;
};

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function getEmailBrandLinks(env: NodeJS.ProcessEnv = process.env): EmailBrandLinks {
  const appUrl = (env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return {
    appUrl,
    settingsUrl: `${appUrl}/dashboard/settings`,
    studioUrl: 'https://arsalandev.studio?utm_source=gatekeeper&utm_medium=email',
  };
}

function buttonHtml(href: string, label: string, primary = true): string {
  const bg = primary ? '#5fd4a4' : '#1b2a24';
  const color = primary ? '#062015' : '#f4f1ea';
  const border = primary ? '#5fd4a4' : '#2a3d34';
  return `<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;border-radius:6px;background:${bg};color:${color};border:1px solid ${border};font-weight:600;text-decoration:none;font-size:14px;">${escapeHtml(label)}</a>`;
}

function layoutHtml(options: { title: string; bodyHtml: string; links: EmailBrandLinks }): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(options.title)}</title></head>
<body style="margin:0;padding:0;background:#07110e;color:#f4f1ea;font-family:IBM Plex Sans,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#07110e;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#0b1612;border:1px solid #1f322a;border-radius:12px;padding:28px 24px;">
        <tr><td>
          <p style="margin:0 0 8px;letter-spacing:0.18em;text-transform:uppercase;color:#5fd4a4;font-size:12px;font-weight:600;">Gatekeeper</p>
          <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:#f4f1ea;">${escapeHtml(options.title)}</h1>
          ${options.bodyHtml}
          <hr style="border:none;border-top:1px solid #1f322a;margin:28px 0 16px;" />
          <p style="margin:0;font-size:12px;line-height:1.5;color:#8fa399;">
            Gatekeeper by Arsalan · <a href="${escapeHtml(options.links.studioUrl)}" style="color:#5fd4a4;text-decoration:none;">arsalandev.studio</a><br/>
            <a href="${escapeHtml(options.links.settingsUrl)}" style="color:#8fa399;">Email settings / unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function footerText(links: EmailBrandLinks): string {
  return [
    '',
    '—',
    'Gatekeeper by Arsalan · arsalandev.studio',
    `Email settings / unsubscribe: ${links.settingsUrl}`,
  ].join('\n');
}

export function buildMagicLinkEmail(input: { url: string; env?: NodeJS.ProcessEnv }): {
  subject: string;
  html: string;
  text: string;
} {
  const links = getEmailBrandLinks(input.env);
  const subject = sanitizeEmailSubject('Sign in to Gatekeeper');
  const text = [
    'Sign in to Gatekeeper with this magic link:',
    input.url,
    '',
    'If you did not request this, you can ignore this email.',
    footerText(links),
  ].join('\n');
  const html = layoutHtml({
    title: 'Sign in to Gatekeeper',
    links,
    bodyHtml: `
      <p style="margin:0 0 20px;line-height:1.55;color:#c9d6cf;">Use the button below to sign in. The link expires soon.</p>
      <p style="margin:0 0 20px;">${buttonHtml(input.url, 'Sign in')}</p>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#8fa399;">Or paste this URL into your browser:<br/><a href="${escapeHtml(input.url)}" style="color:#5fd4a4;word-break:break-all;">${escapeHtml(input.url)}</a></p>
    `,
  });
  return { subject, html, text };
}

export function buildOwnerNotificationEmail(input: {
  receiverName: string;
  senderName: string;
  senderType: string;
  message: string;
  score: number;
  decision: string;
  reasonPublic: string;
  approveUrl: string;
  declineUrl: string;
  inboxUrl: string;
  env?: NodeJS.ProcessEnv;
}): { subject: string; html: string; text: string } {
  const links = getEmailBrandLinks(input.env);
  const preview = input.message.trim().slice(0, 600);
  const subject = sanitizeEmailSubject(
    `Gatekeeper: ${input.decision} · ${input.senderName} (${input.score}/100)`,
  );
  const text = [
    `Hi ${input.receiverName},`,
    '',
    `New intro request from ${input.senderName} (${input.senderType}).`,
    `AI verdict: ${input.decision} · score ${input.score}/100`,
    `Reason: ${input.reasonPublic}`,
    '',
    'Message:',
    preview,
    '',
    `Approve: ${input.approveUrl}`,
    `Decline: ${input.declineUrl}`,
    `Inbox: ${input.inboxUrl}`,
    footerText(links),
  ].join('\n');
  const html = layoutHtml({
    title: 'New intro request',
    links,
    bodyHtml: `
      <p style="margin:0 0 12px;line-height:1.55;color:#c9d6cf;">Hi ${escapeHtml(input.receiverName)},</p>
      <p style="margin:0 0 12px;line-height:1.55;color:#c9d6cf;">
        <strong style="color:#f4f1ea;">${escapeHtml(input.senderName)}</strong>
        (${escapeHtml(input.senderType)}) scored
        <strong style="color:#f4f1ea;">${input.score}/100</strong> —
        verdict <strong style="color:#5fd4a4;">${escapeHtml(input.decision)}</strong>.
      </p>
      <p style="margin:0 0 16px;line-height:1.55;color:#c9d6cf;">${escapeHtml(input.reasonPublic)}</p>
      <blockquote style="margin:0 0 20px;padding:12px 14px;border-left:3px solid #5fd4a4;background:#07110e;color:#f4f1ea;line-height:1.5;">${escapeHtml(preview)}</blockquote>
      <p style="margin:0 0 12px;">${buttonHtml(input.approveUrl, 'Approve intro')}&nbsp;&nbsp;${buttonHtml(input.declineUrl, 'Decline', false)}</p>
      <p style="margin:16px 0 0;font-size:13px;"><a href="${escapeHtml(input.inboxUrl)}" style="color:#5fd4a4;">Open inbox</a></p>
    `,
  });
  return { subject, html, text };
}

export function buildReceiverOptInEmail(input: {
  receiverName: string;
  senderName: string;
  senderType: string;
  message: string;
  score: number;
  acceptUrl: string;
  declineUrl: string;
  env?: NodeJS.ProcessEnv;
}): { subject: string; html: string; text: string } {
  const links = getEmailBrandLinks(input.env);
  const preview = input.message.trim().slice(0, 600);
  const subject = sanitizeEmailSubject(`Gatekeeper: intro request from ${input.senderName}`);
  const text = [
    `Hi ${input.receiverName},`,
    '',
    `Gatekeeper scored an intro request from ${input.senderName} (${input.senderType}) at ${input.score}/100.`,
    '',
    'Message:',
    preview,
    '',
    `Accept: ${input.acceptUrl}`,
    `Decline: ${input.declineUrl}`,
    '',
    'If you Accept, Gatekeeper will email both of you a shared intro.',
    footerText(links),
  ].join('\n');
  const html = layoutHtml({
    title: 'Intro request awaiting you',
    links,
    bodyHtml: `
      <p style="margin:0 0 12px;line-height:1.55;color:#c9d6cf;">Hi ${escapeHtml(input.receiverName)},</p>
      <p style="margin:0 0 12px;line-height:1.55;color:#c9d6cf;">
        Gatekeeper scored an intro from <strong style="color:#f4f1ea;">${escapeHtml(input.senderName)}</strong>
        (${escapeHtml(input.senderType)}) at <strong style="color:#f4f1ea;">${input.score}/100</strong>.
      </p>
      <blockquote style="margin:0 0 20px;padding:12px 14px;border-left:3px solid #5fd4a4;background:#07110e;color:#f4f1ea;line-height:1.5;">${escapeHtml(preview)}</blockquote>
      <p style="margin:0 0 12px;">${buttonHtml(input.acceptUrl, 'Accept intro')}&nbsp;&nbsp;${buttonHtml(input.declineUrl, 'Decline', false)}</p>
      <p style="margin:16px 0 0;font-size:13px;color:#8fa399;">If you Accept, Gatekeeper emails both of you a shared intro.</p>
    `,
  });
  return { subject, html, text };
}

export function buildRejectEmail(input: {
  senderName: string;
  receiverName: string;
  decision: string;
  reasonPublic: string;
  suggestedRewrite: string | null;
  env?: NodeJS.ProcessEnv;
}): { subject: string; html: string; text: string } {
  const links = getEmailBrandLinks(input.env);
  const rewrite = input.suggestedRewrite?.trim() || null;
  const subject = sanitizeEmailSubject(`Gatekeeper update: your intro to ${input.receiverName}`);
  const text = [
    `Hi ${input.senderName},`,
    '',
    `Your intro request to ${input.receiverName} was not forwarded (${input.decision}).`,
    '',
    input.reasonPublic,
    rewrite ? `\nSuggested rewrite:\n${rewrite}` : '',
    '',
    'You can revise and try again from their public Gatekeeper page.',
    footerText(links),
  ]
    .filter(Boolean)
    .join('\n');
  const html = layoutHtml({
    title: 'Intro not forwarded',
    links,
    bodyHtml: `
      <p style="margin:0 0 12px;line-height:1.55;color:#c9d6cf;">Hi ${escapeHtml(input.senderName)},</p>
      <p style="margin:0 0 12px;line-height:1.55;color:#c9d6cf;">
        Your intro request to <strong style="color:#f4f1ea;">${escapeHtml(input.receiverName)}</strong>
        was not forwarded (${escapeHtml(input.decision)}).
      </p>
      <p style="margin:0 0 16px;line-height:1.55;color:#c9d6cf;">${escapeHtml(input.reasonPublic)}</p>
      ${
        rewrite
          ? `<p style="margin:0 0 8px;font-size:13px;color:#8fa399;text-transform:uppercase;letter-spacing:0.08em;">Suggested rewrite</p>
             <blockquote style="margin:0 0 16px;padding:12px 14px;border-left:3px solid #5fd4a4;background:#07110e;color:#f4f1ea;line-height:1.5;">${escapeHtml(rewrite)}</blockquote>`
          : ''
      }
      <p style="margin:0;font-size:13px;color:#8fa399;">You can revise and try again from their public Gatekeeper page.</p>
    `,
  });
  return { subject, html, text };
}

export function buildSenderVerifyEmail(input: {
  senderName: string;
  verifyUrl: string;
  env?: NodeJS.ProcessEnv;
}): { subject: string; html: string; text: string } {
  const links = getEmailBrandLinks(input.env);
  const subject = sanitizeEmailSubject('Verify your email for Gatekeeper');
  const text = [
    `Hi ${input.senderName},`,
    '',
    'Confirm this email to receive Gatekeeper updates about your intro request.',
    'Judgment details stay on-screen until you verify.',
    '',
    `Verify (valid 24h): ${input.verifyUrl}`,
    '',
    "If you didn't request this, you can ignore this email.",
    footerText(links),
  ].join('\n');
  const html = layoutHtml({
    title: 'Verify your email',
    links,
    bodyHtml: `
      <p style="margin:0 0 12px;line-height:1.55;color:#c9d6cf;">Hi ${escapeHtml(input.senderName)},</p>
      <p style="margin:0 0 16px;line-height:1.55;color:#c9d6cf;">
        Confirm this address to receive Gatekeeper updates. Until then, results stay on-screen only.
      </p>
      <p style="margin:0 0 12px;">${buttonHtml(input.verifyUrl, 'Verify email')}</p>
      <p style="margin:16px 0 0;font-size:13px;color:#8fa399;word-break:break-all;">${escapeHtml(input.verifyUrl)}</p>
      <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#8fa399;">If you didn&apos;t request this, you can ignore this email.</p>
    `,
  });
  return { subject, html, text };
}

export function buildDeclineAutoReplyEmail(input: {
  senderName: string;
  receiverName: string;
  env?: NodeJS.ProcessEnv;
}): { subject: string; html: string; text: string } {
  const links = getEmailBrandLinks(input.env);
  const subject = sanitizeEmailSubject(`Thanks for reaching out to ${input.receiverName}`);
  const text = [
    `Hi ${input.senderName},`,
    '',
    `${input.receiverName} declined this intro through Gatekeeper.`,
    'No hard feelings — another ask with a clearer fit may do better next time.',
    footerText(links),
  ].join('\n');
  const html = layoutHtml({
    title: 'Intro declined',
    links,
    bodyHtml: `
      <p style="margin:0 0 12px;line-height:1.55;color:#c9d6cf;">Hi ${escapeHtml(input.senderName)},</p>
      <p style="margin:0 0 12px;line-height:1.55;color:#c9d6cf;">
        <strong style="color:#f4f1ea;">${escapeHtml(input.receiverName)}</strong> declined this intro through Gatekeeper.
      </p>
      <p style="margin:0;line-height:1.55;color:#8fa399;">No hard feelings — another ask with a clearer fit may do better next time.</p>
    `,
  });
  return { subject, html, text };
}

export function buildIntroEmail(input: {
  receiverName: string;
  receiverEmail: string;
  senderName: string;
  senderEmail: string;
  message: string;
  yesUrl: string;
  noUrl: string;
  env?: NodeJS.ProcessEnv;
}): { subject: string; html: string; text: string } {
  const links = getEmailBrandLinks(input.env);
  const subject = sanitizeEmailSubject(`Intro: ${input.senderName} ↔ ${input.receiverName}`);
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
    '',
    `${input.receiverName} — was this intro helpful?`,
    `Yes: ${input.yesUrl}`,
    `No: ${input.noUrl}`,
    footerText(links),
  ].join('\n');
  const html = layoutHtml({
    title: "You're connected",
    links,
    bodyHtml: `
      <p style="margin:0 0 12px;line-height:1.55;color:#c9d6cf;">You're connected via Gatekeeper.</p>
      <p style="margin:0 0 12px;line-height:1.55;color:#c9d6cf;">
        <strong style="color:#f4f1ea;">${escapeHtml(input.receiverName)}</strong> accepted an intro with
        <strong style="color:#f4f1ea;">${escapeHtml(input.senderName)}</strong>.
      </p>
      <blockquote style="margin:0 0 16px;padding:12px 14px;border-left:3px solid #5fd4a4;background:#07110e;color:#f4f1ea;line-height:1.5;">${escapeHtml(input.message.trim())}</blockquote>
      <ul style="margin:0 0 16px;padding-left:18px;color:#c9d6cf;line-height:1.55;">
        <li>${escapeHtml(input.receiverName)}: ${escapeHtml(input.receiverEmail)}</li>
        <li>${escapeHtml(input.senderName)}: ${escapeHtml(input.senderEmail)}</li>
      </ul>
      <p style="margin:0 0 12px;color:#c9d6cf;"><strong style="color:#f4f1ea;">${escapeHtml(input.receiverName)}</strong> — was this intro helpful?</p>
      <p style="margin:0;">${buttonHtml(input.yesUrl, 'Yes, helpful')}&nbsp;&nbsp;${buttonHtml(input.noUrl, 'No', false)}</p>
    `,
  });
  return { subject, html, text };
}

export function buildMatchRequestEmail(input: {
  recipientName: string;
  requesterName: string;
  requesterRole?: string | null;
  note: string;
  acceptUrl: string;
  declineUrl: string;
  inboxUrl: string;
  env?: NodeJS.ProcessEnv;
}): { subject: string; html: string; text: string } {
  const links = getEmailBrandLinks(input.env);
  const subject = sanitizeEmailSubject(`${input.requesterName} wants an intro via Gatekeeper`);
  const role = input.requesterRole?.trim();
  const text = [
    `Hi ${input.recipientName},`,
    '',
    `${input.requesterName}${role ? ` (${role})` : ''} requested an intro through Gatekeeper.`,
    '',
    'Their note:',
    input.note.trim(),
    '',
    `Accept: ${input.acceptUrl}`,
    `Decline: ${input.declineUrl}`,
    `Dashboard: ${input.inboxUrl}`,
    footerText(links),
  ].join('\n');
  const html = layoutHtml({
    title: 'Intro request',
    links,
    bodyHtml: `
      <p style="margin:0 0 12px;line-height:1.55;color:#c9d6cf;">Hi ${escapeHtml(input.recipientName)},</p>
      <p style="margin:0 0 12px;line-height:1.55;color:#c9d6cf;">
        <strong style="color:#f4f1ea;">${escapeHtml(input.requesterName)}</strong>${
          role ? ` (${escapeHtml(role)})` : ''
        } requested an intro through Gatekeeper.
      </p>
      <blockquote style="margin:0 0 20px;padding:12px 14px;border-left:3px solid #5fd4a4;background:#07110e;color:#f4f1ea;line-height:1.5;">${escapeHtml(input.note.trim())}</blockquote>
      <p style="margin:0;">${buttonHtml(input.acceptUrl, 'Accept')}&nbsp;&nbsp;${buttonHtml(input.declineUrl, 'Decline', false)}</p>
      <p style="margin:16px 0 0;font-size:13px;"><a href="${escapeHtml(input.inboxUrl)}" style="color:#5fd4a4;">Open dashboard</a></p>
    `,
  });
  return { subject, html, text };
}

export function buildMatchIntroEmail(input: {
  personAName: string;
  personASummary: string;
  personBName: string;
  personBSummary: string;
  note: string;
  env?: NodeJS.ProcessEnv;
}): { subject: string; html: string; text: string } {
  const links = getEmailBrandLinks(input.env);
  const subject = sanitizeEmailSubject(
    `Intro: ${input.personAName} ↔ ${input.personBName} (via Gatekeeper)`,
  );
  const text = [
    `Intro via Gatekeeper: ${input.personAName} ↔ ${input.personBName}`,
    '',
    `${input.personAName}: ${input.personASummary}`,
    `${input.personBName}: ${input.personBSummary}`,
    '',
    'Note from the requester:',
    input.note.trim(),
    '',
    'Just hit Reply-all to continue — Gatekeeper is not CC’d.',
    footerText(links),
  ].join('\n');
  const html = layoutHtml({
    title: 'You’re connected',
    links,
    bodyHtml: `
      <p style="margin:0 0 12px;line-height:1.55;color:#c9d6cf;">
        Intro via Gatekeeper:
        <strong style="color:#f4f1ea;">${escapeHtml(input.personAName)}</strong> ↔
        <strong style="color:#f4f1ea;">${escapeHtml(input.personBName)}</strong>.
      </p>
      <p style="margin:0 0 8px;line-height:1.55;color:#c9d6cf;"><strong style="color:#f4f1ea;">${escapeHtml(input.personAName)}</strong> — ${escapeHtml(input.personASummary)}</p>
      <p style="margin:0 0 16px;line-height:1.55;color:#c9d6cf;"><strong style="color:#f4f1ea;">${escapeHtml(input.personBName)}</strong> — ${escapeHtml(input.personBSummary)}</p>
      <blockquote style="margin:0 0 16px;padding:12px 14px;border-left:3px solid #5fd4a4;background:#07110e;color:#f4f1ea;line-height:1.5;">${escapeHtml(input.note.trim())}</blockquote>
      <p style="margin:0;line-height:1.55;color:#c9d6cf;">Just hit Reply-all to continue — Gatekeeper is not CC’d.</p>
    `,
  });
  return { subject, html, text };
}
