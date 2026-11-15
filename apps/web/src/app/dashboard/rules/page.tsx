import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { DashboardNav } from '@/components/dashboard-nav';
import { SiteFooter } from '@/components/site-footer';

import { loadRules } from './actions';
import { RulesClient } from './rules-client';

export default async function RulesPage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/start');

  const result = await loadRules();
  if ('error' in result && result.error === 'Sign in required') redirect('/start');
  if (!('data' in result) || !result.data) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-red-300">{'error' in result ? result.error : 'Failed to load'}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <DashboardNav handle={result.data.user.handle} active="/dashboard/rules" />
      <div>
        <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          Rules
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Edit your public profile and private gate rules. Private rules are never shown to senders.
        </p>
      </div>
      <RulesClient initial={result.data} />
      <SiteFooter />
    </main>
  );
}
