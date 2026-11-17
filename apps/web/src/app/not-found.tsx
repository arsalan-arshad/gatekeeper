import type { Metadata } from 'next';
import Link from 'next/link';

import { SiteFooter } from '@/components/site-footer';
import { SiteNav } from '@/components/site-nav';

/**
 * Do not set `robots` here: Next.js already injects exactly one
 * `<meta name="robots" content="noindex"/>` on not-found responses. A second
 * robots meta would duplicate the signal. Nofollow is supplied via
 * `X-Robots-Tag: noindex, nofollow` (middleware for unknown `/@handle`, and
 * `/_not-found` headers in next.config.ts for other 404s).
 *
 * Homepage canonical/OG are intentionally not in the root layout, so this
 * page does not inherit them.
 */
export const metadata: Metadata = {
  title: 'Not found · Gatekeeper',
};

export default function NotFound() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(70% 50% at 50% 0%, rgba(95, 212, 164, 0.12), transparent 55%),
            linear-gradient(165deg, #07110e 0%, #0b1210 50%, #101a16 100%)
          `,
        }}
      />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-6 pb-16 pt-8 sm:px-10">
        <SiteNav compact />
        <div className="flex flex-1 flex-col items-start justify-center py-24">
          <p className="text-sm tracking-[0.2em] text-[var(--accent)] uppercase">404</p>
          <h1
            className="mt-4 max-w-lg text-4xl text-[var(--fg)] sm:text-5xl"
            style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
          >
            This door doesn&apos;t exist
          </h1>
          <p className="mt-4 max-w-md text-[var(--muted)]">
            The page you asked for isn&apos;t on this side of the gate. Head home or try the public
            demo.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/"
              className="rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[#062015] transition hover:brightness-110"
            >
              Back home
            </Link>
            <Link
              href="/@demo"
              className="rounded-md border border-white/15 px-5 py-3 text-sm text-[var(--fg)] hover:border-[var(--accent)]/40"
            >
              Visit @demo
            </Link>
          </div>
          <p className="mt-10 text-sm text-[var(--muted)]">
            <Link href="/" className="text-[var(--accent)] underline underline-offset-4">
              Powered by Gatekeeper
            </Link>
          </p>
        </div>
        <SiteFooter />
      </div>
    </main>
  );
}
