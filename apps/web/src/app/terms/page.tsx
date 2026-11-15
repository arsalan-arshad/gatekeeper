import Link from 'next/link';

import { SiteFooter } from '@/components/site-footer';
import { SiteNav } from '@/components/site-nav';

export default function TermsPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-16">
      <SiteNav compact />
      <div>
        <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          Terms of use
        </h1>
        <p className="mt-3 text-[var(--muted)]">Last updated November 15, 2026.</p>
      </div>
      <div className="space-y-4 leading-relaxed text-[var(--muted)]">
        <p>
          Gatekeeper is provided as open-source software under the AGPL-3.0 license. The hosted
          service is offered as-is without warranties of uninterrupted availability or perfect
          judgment accuracy.
        </p>
        <p>
          You are responsible for the rules you publish, the intros you accept, and complying with
          applicable email and privacy laws. Do not use Gatekeeper to harass others or to evade
          lawful process.
        </p>
        <p>
          Pro billing, when enabled, is processed by Lemon Squeezy. Free plans may have fair-use
          limits on judging and inboxes.
        </p>
        <p>
          Questions? Visit{' '}
          <Link href="/privacy" className="text-[var(--accent)] underline">
            Privacy
          </Link>{' '}
          or the project on GitHub.
        </p>
      </div>
      <SiteFooter />
    </main>
  );
}
