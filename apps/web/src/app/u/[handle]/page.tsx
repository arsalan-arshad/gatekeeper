import Link from 'next/link';
import { notFound } from 'next/navigation';

import { SiteNav } from '@/components/site-nav';
import { API_URL } from '@/lib/api';
import { DEMO_USER_FALLBACK } from '@/lib/demo';

import { IntroRequestForm } from './intro-form';

type PublicUser = {
  handle: string;
  name: string;
  bio: string | null;
  wantsText: string | null;
  offersText: string | null;
};

async function getPublicUser(
  handle: string,
): Promise<{ user: PublicUser; demoFallback: boolean } | null> {
  const normalized = handle.toLowerCase();
  try {
    const response = await fetch(`${API_URL}/v1/users/${encodeURIComponent(normalized)}`, {
      cache: 'no-store',
    });
    if (response.ok) {
      const body = (await response.json()) as { user: PublicUser };
      return { user: body.user, demoFallback: false };
    }
    if (normalized === 'demo') {
      // Seeded @demo may be missing when DB is down — keep the public demo page up.
      return { user: DEMO_USER_FALLBACK, demoFallback: true };
    }
    if (response.status === 404) return null;
  } catch {
    if (normalized === 'demo') {
      return { user: DEMO_USER_FALLBACK, demoFallback: true };
    }
  }
  return null;
}

export default async function PublicHandlePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const data = await getPublicUser(handle);
  if (!data) notFound();

  const { user, demoFallback } = data;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <SiteNav compact />

      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-[var(--muted)]">@{user.handle}</p>
          {demoFallback || user.handle === 'demo' ? (
            <span className="rounded-md border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-2.5 py-1 text-xs font-semibold tracking-wide text-[var(--accent)] uppercase">
              Demo data
            </span>
          ) : null}
        </div>
        <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          {user.name}
        </h1>
        {user.bio ? <p className="text-lg text-[var(--muted)]">{user.bio}</p> : null}
        {user.wantsText ? (
          <p className="text-sm text-[var(--muted)]">
            <span className="text-[var(--accent)]">Open to:</span> {user.wantsText}
          </p>
        ) : null}
        {user.offersText ? (
          <p className="text-sm text-[var(--muted)]">
            <span className="text-[var(--accent)]">Offers:</span> {user.offersText}
          </p>
        ) : null}
        <Link className="text-sm text-[var(--accent)] underline" href={`/@${user.handle}/ledger`}>
          View public ledger
        </Link>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          Request an intro
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Your note goes to {user.name}&apos;s Gatekeeper first. Private rules stay private.
          {demoFallback
            ? ' Live submission needs the API and seeded @demo user — try the landing demo meanwhile.'
            : null}
        </p>
        {!demoFallback ? <IntroRequestForm handle={user.handle} /> : null}
        {demoFallback ? (
          <Link
            href="/#try"
            className="w-fit rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#062015]"
          >
            Try the interactive demo
          </Link>
        ) : null}
      </section>
    </main>
  );
}
