export const BRAND = {
  name: 'Gatekeeper',
  tagline: 'Let anyone reach you. Only the right ones get through.',
  summary:
    'Gatekeeper is an AI principal with its own reputation. It reads every request against your rules, says no to spam, and only makes intros you both accept.',
  githubUrl: process.env.NEXT_PUBLIC_GITHUB_URL || 'https://github.com/arsalan-arshad/gatekeeper',
  /** Optional — footer hides X when unset (no hardcoded personal links). */
  xUrl: process.env.NEXT_PUBLIC_X_URL?.trim() || null,
  /** Optional — footer hides LinkedIn when unset. */
  linkedinUrl: process.env.NEXT_PUBLIC_LINKEDIN_URL?.trim() || null,
  // OG/sitemap base — NEXT_PUBLIC_SITE_URL only (reject empty/"null"; never APP_URL).
  siteUrl: (() => {
    const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (raw && raw !== 'null' && /^https?:\/\//i.test(raw)) {
      return raw.replace(/\/$/, '');
    }
    return 'https://gatekeeper.arsalandev.studio';
  })(),
  creator: {
    name: 'Arsalan',
    studioName: 'arsalandev.studio',
    studioUrl: 'https://arsalandev.studio',
    bio:
      process.env.NEXT_PUBLIC_CREATOR_BIO ||
      'Indie developer shipping open-source tools for founders who want agents that can say no.',
    avatarUrl: process.env.NEXT_PUBLIC_CREATOR_AVATAR_URL || '/brand/creator-avatar.svg',
  },
} as const;

export function studioLink(medium: 'footer' | 'landing' | 'email'): string {
  return `${BRAND.creator.studioUrl}?utm_source=gatekeeper&utm_medium=${medium}`;
}
