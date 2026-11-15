'use client';

import Link from 'next/link';
import { useState } from 'react';

import { BRAND } from '@/lib/brand';

export function SiteNav({ compact = false }: { compact?: boolean } = {}) {
  const [open, setOpen] = useState(false);

  return (
    <nav className="relative flex items-center justify-between gap-4 text-[0.9375rem] text-[var(--muted)]">
      <Link
        href="/"
        className="tracking-[0.18em] text-[var(--accent)] uppercase hover:brightness-110"
      >
        {BRAND.name}
      </Link>

      <div className="hidden items-center gap-x-5 sm:flex">
        {!compact ? (
          <>
            <a href="/#how-it-works" className="hover:text-[var(--fg)]">
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

      <button
        type="button"
        className="inline-flex items-center justify-center rounded-md border border-white/15 px-3 py-2 text-sm text-[var(--fg)] sm:hidden"
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Close' : 'Menu'}
      </button>

      {open ? (
        <div
          id="mobile-nav"
          className="absolute top-full right-0 z-20 mt-2 flex w-56 flex-col gap-3 rounded-md border border-white/10 bg-[#0b1612] p-4 shadow-lg sm:hidden"
        >
          {!compact ? (
            <a
              href="/#how-it-works"
              className="hover:text-[var(--fg)]"
              onClick={() => setOpen(false)}
            >
              How it works
            </a>
          ) : null}
          <Link href="/ledger" className="hover:text-[var(--fg)]" onClick={() => setOpen(false)}>
            Ledger
          </Link>
          <Link href="/@demo" className="hover:text-[var(--fg)]" onClick={() => setOpen(false)}>
            @demo
          </Link>
          <Link
            href="/start"
            className="rounded-md bg-[var(--accent)] px-3.5 py-2 text-center text-sm font-semibold text-[#062015]"
            onClick={() => setOpen(false)}
          >
            Start free
          </Link>
        </div>
      ) : null}
    </nav>
  );
}
