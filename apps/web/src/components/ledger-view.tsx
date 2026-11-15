import Link from 'next/link';

import { SiteNav } from '@/components/site-nav';
import { formatPercent, type LedgerPayload } from '@/lib/ledger';

export function LedgerView({
  data,
  title,
  notice,
  demoData = false,
}: {
  data: LedgerPayload;
  title: string;
  notice?: string;
  /** Marks charts/stats as seeded demo data (e.g. /@demo/ledger). */
  demoData?: boolean;
}) {
  const { totals, months } = data;
  const maxRequests = Math.max(1, ...months.map((m) => m.requestCount));

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-16">
      <SiteNav compact />

      {demoData ? (
        <p
          data-testid="demo-data-badge"
          className="w-fit rounded-md border border-[var(--accent)]/35 bg-[var(--accent)]/10 px-2.5 py-1 text-sm font-semibold tracking-wide text-[var(--accent)] uppercase"
        >
          Demo data
        </p>
      ) : null}

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
            {title}
          </h1>
        </div>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Public reputation: requests, delivered intros, receiver accepts, spam blocked, and trust
          from helpful ratings. Private gate rules are never shown.
        </p>
        {notice ? <p className="mt-3 text-sm text-[var(--muted)]">{notice}</p> : null}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <Link href="/ledger" className="text-[var(--muted)] underline hover:text-[var(--fg)]">
            Global ledger
          </Link>
          {data.user ? (
            <Link
              href={`/@${data.user.handle}`}
              className="text-[var(--muted)] underline hover:text-[var(--fg)]"
            >
              @{data.user.handle}
            </Link>
          ) : null}
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <Stat label="Requests" value={String(totals.requestCount)} />
        <Stat label="Delivered" value={String(totals.deliveredCount)} />
        <Stat label="Accepted" value={String(totals.acceptedCount)} />
        <Stat label="Spam blocked" value={String(totals.spamCount)} />
        <Stat label="Accept rate" value={formatPercent(totals.acceptRate)} />
        <Stat label="Trust score" value={formatPercent(totals.trustScore)} />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
            Monthly chart
          </h2>
          {demoData ? (
            <span className="text-sm tracking-wide text-[var(--accent)] uppercase" aria-hidden>
              Demo data
            </span>
          ) : null}
        </div>
        {months.length === 0 ? (
          <p className="text-[var(--muted)]">No requests yet.</p>
        ) : (
          <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
            {months.map((row) => (
              <div key={row.month} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3">
                <span className="text-sm text-[var(--muted)]">{row.month}</span>
                <div className="h-3 overflow-hidden rounded-sm bg-white/5">
                  <div
                    className="h-full rounded-sm bg-[var(--accent)]/70"
                    style={{ width: `${Math.max(6, (row.requestCount / maxRequests) * 100)}%` }}
                    title={`${row.requestCount} requests`}
                  />
                </div>
                <span className="text-sm tabular-nums text-[var(--fg)]">{row.requestCount}</span>
              </div>
            ))}
            <div className="flex flex-wrap gap-4 pt-2 text-sm text-[var(--muted)]">
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[var(--accent)]/70" />
                Requests / month
              </span>
              {demoData ? <span>Charts show seeded demo traffic</span> : null}
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          By month
        </h2>
        {months.length === 0 ? (
          <p className="text-[var(--muted)]">No requests yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-[var(--muted)]">
                <tr>
                  <th className="py-2 pr-3 font-medium">Month</th>
                  <th className="py-2 pr-3 font-medium">Requests</th>
                  <th className="py-2 pr-3 font-medium">Delivered</th>
                  <th className="py-2 pr-3 font-medium">Accepted</th>
                  <th className="py-2 pr-3 font-medium">Spam</th>
                  <th className="py-2 pr-3 font-medium">Accept rate</th>
                </tr>
              </thead>
              <tbody>
                {months.map((row) => (
                  <tr key={row.month} className="border-t border-white/10">
                    <td className="py-2 pr-3">{row.month}</td>
                    <td className="py-2 pr-3">{row.requestCount}</td>
                    <td className="py-2 pr-3">{row.deliveredCount}</td>
                    <td className="py-2 pr-3">{row.acceptedCount}</td>
                    <td className="py-2 pr-3">{row.spamCount}</td>
                    <td className="py-2 pr-3">{formatPercent(row.acceptRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
