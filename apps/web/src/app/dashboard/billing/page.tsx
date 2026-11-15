import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { DashboardNav } from '@/components/dashboard-nav';
import { SiteFooter } from '@/components/site-footer';
import { apiFetch } from '@/lib/api';

import { loadBilling } from './actions';
import { BillingClient } from './billing-client';

export default async function BillingDashboardPage() {
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

  const { data, error } = await loadBilling();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <DashboardNav handle={handle} active="/dashboard/billing" />

      <div>
        <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          Billing
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Free vs Pro ($9/mo). Upgrade uses Lemon Squeezy when configured — otherwise Coming soon.
          No Stripe.
        </p>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {data ? <BillingClient initial={data} /> : null}
      <SiteFooter />
    </main>
  );
}
