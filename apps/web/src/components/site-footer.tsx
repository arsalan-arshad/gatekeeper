import Link from 'next/link';

import { BRAND } from '@/lib/brand';

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
          <Link href="/start" className="hover:text-[var(--fg)]">
            Start free
          </Link>
          <Link href="/@demo" className="hover:text-[var(--fg)]">
            Try @demo
          </Link>
          <Link href="/ledger" className="hover:text-[var(--fg)]">
            Ledger
          </Link>
          <Link href="/privacy" className="hover:text-[var(--fg)]">
            Privacy
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
            rel="noreferrer"
            target="_blank"
          >
            GitHub
          </a>
        </div>
      </div>
      <p className="mx-auto mt-10 max-w-6xl px-6 text-sm sm:px-10">
        AGPL-3.0 · Agents are untrusted · Principals have reputation
      </p>
    </footer>
  );
}
