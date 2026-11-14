import Link from 'next/link';
import { notFound } from 'next/navigation';

import { API_URL } from '@/lib/api';

import { IntroRequestForm } from './intro-form';

async function getPublicUser(handle: string) {
  const response = await fetch(`${API_URL}/v1/users/${encodeURIComponent(handle)}`, {
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error('Failed to load profile');
  }
  return (await response.json()) as {
    user: {
      handle: string;
      name: string;
      bio: string | null;
      wantsText: string | null;
      offersText: string | null;
    };
  };
}

export default async function PublicHandlePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const data = await getPublicUser(handle);
  if (!data) notFound();

  const { user } = data;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <Link href="/" className="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">
        Gatekeeper
      </Link>

      <header className="flex flex-col gap-3">
        <p className="text-sm text-[var(--muted)]">@{user.handle}</p>
        <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          {user.name}
        </h1>
        {user.bio ? <p className="text-lg text-[var(--muted)]">{user.bio}</p> : null}
        {user.wantsText ? (
          <p className="text-sm text-[var(--muted)]">
            <span className="text-[var(--accent)]">Open to:</span> {user.wantsText}
          </p>
        ) : null}
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          Request an intro
        </h2>
        <p className="text-sm text-[var(--muted)]">
          Your note goes to {user.name}&apos;s Gatekeeper first. Private rules stay private.
        </p>
        <IntroRequestForm handle={user.handle} />
      </section>
    </main>
  );
}
