/** Landing primary-CTA variants (PostHog `cta_variant`; no PII). */
export type CtaVariant = 'start_free' | 'dashboard' | 'finish_setup';

export type LandingCtaResolved = {
  href: string;
  label: string;
  cta_variant: CtaVariant;
};

/**
 * Resolve home CTA from session + published-handle state.
 * Logged-out → Start free /start; signed-in with handle → dashboard;
 * signed-in without published handle → Finish setup /start (interview).
 */
export function resolveLandingCta(input: {
  signedIn: boolean;
  hasPublishedHandle: boolean;
}): LandingCtaResolved {
  if (!input.signedIn) {
    return { href: '/start', label: 'Start free', cta_variant: 'start_free' };
  }
  if (input.hasPublishedHandle) {
    return { href: '/dashboard', label: 'Go to dashboard', cta_variant: 'dashboard' };
  }
  return { href: '/start', label: 'Finish setup', cta_variant: 'finish_setup' };
}

export function ctaVariantFromFlags(input: {
  signedIn: boolean;
  hasPublishedHandle: boolean;
}): CtaVariant {
  return resolveLandingCta(input).cta_variant;
}
