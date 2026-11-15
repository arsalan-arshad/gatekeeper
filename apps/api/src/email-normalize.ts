/**
 * Normalize an email for rate-limit bucket keys so aliases share one quota:
 * lowercase, strip +tag from the local part, and for gmail.com / googlemail.com
 * also strip dots in the local part.
 */
export function normalizeEmailForRateLimit(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0) return trimmed;

  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  const plus = local.indexOf('+');
  if (plus >= 0) local = local.slice(0, plus);

  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.replaceAll('.', '');
  }

  return `${local}@${domain}`;
}
