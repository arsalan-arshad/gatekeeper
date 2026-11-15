import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { DashboardNav } from '@/components/dashboard-nav';
import { SiteFooter } from '@/components/site-footer';
import { API_URL, apiFetch } from '@/lib/api';
import { emptyGlobalLedger, formatPercent, type LedgerPayload } from '@/lib/ledger';

async function loadUserLedger(handle: string): Promise<LedgerPayload> {
  try {
    const response = await fetch(`${API_URL}/v1/users/${encodeURIComponent(handle)}/ledger`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      return {
        ...emptyGlobalLedger(),
        scope: 'user',
        user: { handle, name: handle },
      };
    }
    return (await response.json()) as LedgerPayload;
  } catch {
    return {
      ...emptyGlobalLedger(),
      scope: 'user',
      user: { handle, name: handle },
    };
  }
}

export default async function DashboardLedgerPage() {
  const session = await auth();
  if (!session?.user?.email) redirect('/start');

  let handle: string;
  try {
    const me = await apiFetch<{ onboarded: boolean; user: { handle: string } | null }>(
      '/v1/onboarding/me',
      { email: session.user.email },
    );
    if (!me.onboarded || !me.user) redirect('/start');
    handle = me.user.handle;
  } catch {
    redirect('/start');
  }

  const data = await loadUserLedger(handle);
  const { totals } = data;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <DashboardNav handle={handle} active="/dashboard/ledger" />
      <div>
        <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          Your ledger
        </h1>
        <p className="mt-3 text-[var(--muted)]">
          Your reputation stats. Public view stays shareable without private rules.
        </p>
        <Link
          href={`/@${handle}/ledger`}
          className="mt-4 inline-block text-[var(--accent)] underline"
        >
          Open public ledger
        </Link>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <Stat label="Requests" value={String(totals.requestCount)} />
        <Stat label="Delivered" value={String(totals.deliveredCount)} />
        <Stat label="Accepted" value={String(totals.acceptedCount)} />
        <Stat label="Spam blocked" value={String(totals.spamCount)} />
        <Stat label="Accept rate" value={formatPercent(totals.acceptRate)} />
        <Stat label="Trust" value={formatPercent(totals.trustScore)} />
      </section>
      <SiteFooter />
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-white/10 pb-3">
      <p className="text-sm text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
        {value}
      </p>
    </div>
  );
}
