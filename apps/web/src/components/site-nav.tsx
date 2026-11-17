'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { LandingCta } from '@/components/landing-cta';
import { BRAND } from '@/lib/brand';

function MenuIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path
          d="M5 5l10 10M15 5L5 15"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M4 6h12M4 10h12M4 14h12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SiteNav({ compact = false }: { compact?: boolean } = {}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  function closeMenu() {
    setOpen(false);
  }

  return (
    <nav
      ref={navRef}
      className="relative flex flex-col gap-0 text-[0.9375rem] text-[var(--muted)]"
      data-testid="site-nav"
    >
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/"
          className="tracking-[0.18em] text-[var(--accent)] uppercase hover:brightness-110"
        >
          {BRAND.name}
        </Link>

        <div className="hidden items-center gap-x-5 sm:flex" data-testid="desktop-nav-links">
          {!compact ? (
            <>
              <a href="/#how-it-works" className="hover:text-[var(--fg)]">
                How it works
              </a>
              <Link href="/explore" className="hover:text-[var(--fg)]">
                Explore
              </Link>
              <Link href="/ledger" className="hover:text-[var(--fg)]">
                Ledger
              </Link>
              <Link href="/@demo" className="hover:text-[var(--fg)]">
                @demo
              </Link>
            </>
          ) : (
            <>
              <Link href="/explore" className="hover:text-[var(--fg)]">
                Explore
              </Link>
              <Link href="/ledger" className="hover:text-[var(--fg)]">
                Ledger
              </Link>
            </>
          )}
          <LandingCta appearance="nav" />
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md border border-white/15 p-2 text-[var(--fg)] sm:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls={menuId}
          data-testid="mobile-nav-toggle"
          onClick={() => setOpen((v) => !v)}
        >
          <MenuIcon open={open} />
        </button>
      </div>

      <div
        id={menuId}
        data-testid="mobile-nav-menu"
        hidden={!open}
        className="mt-3 flex flex-col gap-3 border-t border-white/10 pt-3 sm:hidden"
      >
        {!compact ? (
          <a href="/#how-it-works" className="hover:text-[var(--fg)]" onClick={closeMenu}>
            How it works
          </a>
        ) : null}
        <Link href="/explore" className="hover:text-[var(--fg)]" onClick={closeMenu}>
          Explore
        </Link>
        <Link href="/ledger" className="hover:text-[var(--fg)]" onClick={closeMenu}>
          Ledger
        </Link>
        <Link href="/@demo" className="hover:text-[var(--fg)]" onClick={closeMenu}>
          @demo
        </Link>
        <LandingCta
          appearance="nav"
          className="rounded-md bg-[var(--accent)] px-3.5 py-2 text-center text-sm font-semibold text-[#062015]"
          onNavigate={closeMenu}
        />
      </div>
    </nav>
  );
}
