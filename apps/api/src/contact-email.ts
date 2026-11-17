import type { EmailSender } from './email.js';
import { buildIntroContactVerifyEmail } from './email-templates.js';
import { isEmailSuppressed } from './email-suppression.js';
import { consumePostgresRateLimit } from './rate-limit.js';
import { createIntroContactVerifyToken } from './tokens.js';

/**
 * Effective intro contact for a Gatekeeper user.
 *
 * Login email is always usable (magic-link ownership). An alternate
 * `intro_contact_email` is used only when `intro_contact_verified_at` is set
 * for this user — proving they clicked a link delivered to that mailbox.
 *
 * Do NOT consult the global `verified_senders` table: that only records that
 * *someone* completed sender-verify for an address, not that this user owns it.
 */

export function resolveIntroContactEmail(user: {
  email: string;
  introContactEmail?: string | null;
  introContactVerifiedAt?: Date | string | null;
}): string {
  const login = user.email.trim().toLowerCase();
  const alt = user.introContactEmail?.trim().toLowerCase() || null;
  if (!alt || alt === login) return login;
  if (user.introContactVerifiedAt) return alt;
  return login;
}

export function introContactNeedsVerification(user: {
  email: string;
  introContactEmail?: string | null;
  introContactVerifiedAt?: Date | string | null;
}): boolean {
  const login = user.email.trim().toLowerCase();
  const alt = user.introContactEmail?.trim().toLowerCase() || null;
  return Boolean(alt && alt !== login && !user.introContactVerifiedAt);
}

export async function sendIntroContactVerificationEmail(input: {
  send: EmailSender;
  userId: string;
  name: string;
  introContactEmail: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ sent: boolean; reason?: string }> {
  const email = input.introContactEmail.trim().toLowerCase();
  if (await isEmailSuppressed(email)) {
    return { sent: false, reason: 'suppressed' };
  }

  const limit = await consumePostgresRateLimit(
    `intro-contact-verify:${input.userId}`,
    3,
    24 * 60 * 60 * 1000,
  );
  if (!limit.ok) {
    return { sent: false, reason: 'rate_limited' };
  }

  const token = createIntroContactVerifyToken({ userId: input.userId, email }, { env: input.env });
  const base = (
    input.env?.API_URL ??
    process.env.API_URL ??
    input.env?.APP_URL ??
    process.env.APP_URL ??
    'http://localhost:4000'
  ).replace(/\/$/, '');
  const verifyUrl = `${base}/v1/intro-contact/verify?token=${encodeURIComponent(token)}`;
  const content = buildIntroContactVerifyEmail({
    name: input.name,
    verifyUrl,
    env: input.env,
  });
  await input.send({ to: email, ...content });
  return { sent: true };
}
