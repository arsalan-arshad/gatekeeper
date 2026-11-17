'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { captureEvent } from '@/lib/analytics/client';
import {
  resolveLandingCta,
  type CtaVariant,
  type LandingCtaResolved,
} from '@/lib/landing-cta';

type Appearance = 'button' | 'link' | 'nav';

const DEFAULT: LandingCtaResolved = resolveLandingCta({
  signedIn: false,
  hasPublishedHandle: false,
});

/**
 * Cache-friendly landing CTA: SSR/default HTML is always logged-out
 * ("Start free" → /start). Session state loads client-side so no user
 * data is baked into cached HTML.
 */
export function LandingCta({
  className,
  appearance = 'button',
  onNavigate,
}: {
  className?: string;
  appearance?: Appearance;
  onNavigate?: () => void;
}) {
  const [cta, setCta] = useState<LandingCtaResolved>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/cta', { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { variant?: CtaVariant };
      })
      .then((body) => {
        if (cancelled || !body?.variant) return;
        if (body.variant === 'dashboard') {
          setCta(resolveLandingCta({ signedIn: true, hasPublishedHandle: true }));
        } else if (body.variant === 'finish_setup') {
          setCta(resolveLandingCta({ signedIn: true, hasPublishedHandle: false }));
        } else {
          setCta(DEFAULT);
        }
      })
      .catch(() => {
        /* keep logged-out default */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const resolvedClassName =
    className ??
    (appearance === 'link'
      ? 'hover:text-[var(--fg)]'
      : appearance === 'nav'
        ? 'rounded-md bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-[#062015] transition hover:brightness-110'
        : 'rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#062015] transition hover:brightness-110');

  return (
    <Link
      href={cta.href}
      className={resolvedClassName}
      data-cta-variant={cta.cta_variant}
      onClick={() => {
        captureEvent('cta_clicked', { cta_variant: cta.cta_variant });
        onNavigate?.();
      }}
    >
      {cta.label}
    </Link>
  );
}
