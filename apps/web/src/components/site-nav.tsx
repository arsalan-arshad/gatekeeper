import Link from 'next/link';

import { BRAND } from '@/lib/brand';

export function SiteNav({ compact = false }: { compact?: boolean } = {}) {
  return (
    <nav className="flex items-center justify-between gap-4 text-[0.9375rem] text-[var(--muted)]">
      <Link
        href="/"
        className="tracking-[0.18em] text-[var(--accent)] uppercase hover:brightness-110"
      >
        {BRAND.name}
      </Link>
      <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
        {!compact ? (
          <>
            <a href="/#how-it-works" className="hidden hover:text-[var(--fg)] sm:inline">
              How it works
            </a>
            <Link href="/ledger" className="hover:text-[var(--fg)]">
              Ledger
            </Link>
            <Link href="/@demo" className="hover:text-[var(--fg)]">
              @demo
            </Link>
          </>
        ) : (
          <Link href="/ledger" className="hover:text-[var(--fg)]">
            Ledger
          </Link>
        )}
        <Link
          href="/start"
          className="rounded-md bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-[#062015] transition hover:brightness-110"
        >
          Start free
        </Link>
      </div>
    </nav>
  );
}
