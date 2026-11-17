import Link from 'next/link';

import { LandingCta } from '@/components/landing-cta';
import { BRAND, studioLink } from '@/lib/brand';

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 py-12 text-[0.9375rem] text-[var(--muted)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 sm:flex-row sm:items-start sm:justify-between sm:px-10">
        <div className="max-w-sm">
          <p className="tracking-[0.18em] text-[var(--accent)] uppercase">{BRAND.name}</p>
          <p className="mt-3 leading-relaxed">
            Open-source AI principal. Requests meet your rules first. Only double-opt-in intros get
            through.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3">
          <LandingCta appearance="link" className="hover:text-[var(--fg)]" />
          <Link href="/@demo" className="hover:text-[var(--fg)]">
            Try @demo
          </Link>
          <Link href="/ledger" className="hover:text-[var(--fg)]">
            Ledger
          </Link>
          <Link href="/privacy" className="hover:text-[var(--fg)]">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-[var(--fg)]">
            Terms
          </Link>
          <Link href="/llms.txt" className="hover:text-[var(--fg)]">
            /llms.txt
          </Link>
          <Link href="/openapi.json" className="hover:text-[var(--fg)]">
            OpenAPI
          </Link>
          <a
            href={BRAND.githubUrl}
            className="hover:text-[var(--fg)]"
            rel="noopener noreferrer"
            target="_blank"
          >
            GitHub
          </a>
          {BRAND.xUrl ? (
            <a
              href={BRAND.xUrl}
              className="hover:text-[var(--fg)]"
              rel="noopener noreferrer"
              target="_blank"
            >
              X
            </a>
          ) : null}
          {BRAND.linkedinUrl ? (
            <a
              href={BRAND.linkedinUrl}
              className="hover:text-[var(--fg)]"
              rel="noopener noreferrer"
              target="_blank"
            >
              LinkedIn
            </a>
          ) : null}
        </div>
      </div>
      <div className="mx-auto mt-10 flex max-w-6xl flex-col gap-2 px-6 text-sm sm:px-10">
        <p>
          Built by {BRAND.creator.name} ·{' '}
          <a
            href={studioLink('footer')}
            className="text-[var(--accent)] underline underline-offset-4 hover:brightness-110"
            rel="noopener noreferrer"
            target="_blank"
          >
            {BRAND.creator.studioName}
          </a>
        </p>
        <p>AGPL-3.0 · Agents are untrusted · Principals have reputation</p>
      </div>
    </footer>
  );
}
