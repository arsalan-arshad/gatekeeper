import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';

import { listApiKeys } from './actions';
import { KeysClient } from './keys-client';

export default async function ApiKeysDashboardPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/start');
  }

  const { keys, error } = await listApiKeys();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">
          Gatekeeper
        </Link>
        <Link href="/start" className="text-sm text-[var(--muted)] underline">
          Onboarding
        </Link>
      </div>

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
    </main>
  );
}
