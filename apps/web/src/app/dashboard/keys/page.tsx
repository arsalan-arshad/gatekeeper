import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { DashboardNav } from '@/components/dashboard-nav';
import { SiteFooter } from '@/components/site-footer';
import { apiFetch } from '@/lib/api';

import { listApiKeys } from './actions';
import { KeysClient } from './keys-client';

export default async function ApiKeysDashboardPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/start');
  }

  let handle: string | null = null;
  try {
    const me = await apiFetch<{ onboarded: boolean; user: { handle: string } | null }>(
      '/v1/onboarding/me',
      { email: session.user.email },
    );
    handle = me.user?.handle ?? null;
  } catch {
    handle = null;
  }

  const { keys, error } = await listApiKeys();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <DashboardNav handle={handle} active="/dashboard/keys" />

      <div>
        <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          API keys
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Issue keys for AI agents calling <code>POST /v1/requests</code>. See{' '}
          <code>/llms.txt</code> on the API for agent instructions.
        </p>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <KeysClient initialKeys={keys} />
      <SiteFooter />
    </main>
  );
}
