import { isSenderContactVerified } from './sender-verify.js';

/**
 * Effective intro contact: verified intro_contact_email if set and different
 * from login email; otherwise users.email. Unverified alternate contacts fall
 * back to the magic-link login email.
 */
export async function resolveIntroContactEmail(user: {
  email: string;
  introContactEmail?: string | null;
}): Promise<string> {
  const login = user.email.trim().toLowerCase();
  const alt = user.introContactEmail?.trim().toLowerCase() || null;
  if (!alt || alt === login) return login;
  if (await isSenderContactVerified(alt)) return alt;
  return login;
}
