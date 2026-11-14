import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';

import { loadBilling } from './actions';
import { BillingClient } from './billing-client';

export default async function BillingDashboardPage() {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/start');
  }

  const { data, error } = await loadBilling();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">
          Gatekeeper
        </Link>
        <Link href="/dashboard/keys" className="text-sm text-[var(--muted)] underline">
          API keys
        </Link>
      </div>

      <div>
        <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          Billing
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Lemon Squeezy Pro, intro credits, and optional sender stakes — behind{' '}
          <code>PAYMENTS_ENABLED</code>.
        </p>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {data ? <BillingClient initial={data} /> : null}
    </main>
  );
}
