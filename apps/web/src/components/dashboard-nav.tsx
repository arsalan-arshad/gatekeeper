import Link from 'next/link';

import { CopyHandleLink } from '@/components/copy-handle-link';
import { SignOutButton } from '@/components/sign-out-button';

const LINKS = [
  { href: '/dashboard', label: 'Inbox' },
  { href: '/dashboard/rules', label: 'Rules' },
  { href: '/dashboard/ledger', label: 'Ledger' },
  { href: '/dashboard/settings', label: 'Settings' },
  { href: '/dashboard/billing', label: 'Billing' },
  { href: '/dashboard/keys', label: 'API keys' },
] as const;

export function DashboardNav({
  handle,
  active,
}: {
  handle?: string | null;
  active?: (typeof LINKS)[number]['href'] | 'dashboard';
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-white/10 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="text-sm tracking-[0.18em] text-[var(--accent)] uppercase">
          Gatekeeper
        </Link>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--muted)]">
          <Link href="/dashboard" className="hover:text-[var(--fg)]">
            Dashboard
          </Link>
          {handle ? (
            <>
              <Link href={`/@${handle}`} className="hover:text-[var(--fg)]">
                My page
              </Link>
              <CopyHandleLink handle={handle} />
            </>
          ) : null}
          <SignOutButton className="hover:text-[var(--fg)]" />
        </nav>
      </div>
      <nav className="flex flex-wrap gap-2">
        {LINKS.map((link) => {
          const isActive =
            active === link.href || (active === 'dashboard' && link.href === '/dashboard');
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-1.5 text-sm ${
                isActive
                  ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                  : 'text-[var(--muted)] hover:text-[var(--fg)]'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
