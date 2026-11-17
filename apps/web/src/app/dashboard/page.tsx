import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { auth } from '@/auth';
import { DashboardNav } from '@/components/dashboard-nav';
import { SiteFooter } from '@/components/site-footer';
import { apiFetch } from '@/lib/api';

import { loadInbox, loadMatches } from './actions';
import { DirectoryBanner } from './directory-banner';
import { InboxClient } from './inbox-client';
import { MatchesClient } from './matches-client';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/start');
  }

  const params = await searchParams;
  const filter = params.filter ?? 'all';

  let handle: string | null = null;
  let showDirectoryBanner = false;
  try {
    const me = await apiFetch<{
      onboarded: boolean;
      user: {
        handle: string;
        directoryOptIn?: boolean;
        directoryPromptDismissed?: boolean;
      } | null;
    }>('/v1/onboarding/me', { email: session.user.email });
    if (!me.onboarded || !me.user) {
      redirect('/start');
    }
    handle = me.user.handle;
    showDirectoryBanner =
      me.user.directoryOptIn === false && me.user.directoryPromptDismissed !== true;
  } catch {
    redirect('/start');
  }

  const inbox = await loadInbox(filter);
  const matches = await loadMatches();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <DashboardNav handle={handle} active="/dashboard" />
      <div>
        <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          Inbox
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Intro requests with AI verdict, score, and reason. Owner approve/decline keeps the AI
          verdict and shows a separate Owner badge.
        </p>
      </div>
      {showDirectoryBanner ? <DirectoryBanner /> : null}
      {'error' in matches && matches.error ? (
        <p className="text-sm text-red-300">{matches.error}</p>
      ) : (
        <MatchesClient
          optedIn={matches.data?.optedIn ?? false}
          suggestions={matches.data?.suggestions ?? []}
          incoming={matches.data?.incoming ?? []}
          needsIntroResend={matches.data?.needsIntroResend ?? []}
        />
      )}
      {'error' in inbox && inbox.error ? (
        <p className="text-sm text-red-300">{inbox.error}</p>
      ) : (
        <Suspense fallback={<p className="text-[var(--muted)]">Loading inbox…</p>}>
          <InboxClient initialItems={inbox.data?.items ?? []} initialFilter={filter} />
        </Suspense>
      )}
      <SiteFooter />
    </main>
  );
}
