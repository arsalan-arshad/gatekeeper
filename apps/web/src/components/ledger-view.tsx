import Link from 'next/link';

import { formatPercent, type LedgerPayload } from '@/lib/ledger';

export function LedgerView({ data, title }: { data: LedgerPayload; title: string }) {
  const { totals, months } = data;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">
          Gatekeeper
        </Link>
        <div className="flex gap-4 text-sm">
          <Link href="/ledger" className="text-[var(--muted)] underline">
            Global ledger
          </Link>
          {data.user ? (
            <Link href={`/@${data.user.handle}`} className="text-[var(--muted)] underline">
              @{data.user.handle}
            </Link>
          ) : null}
        </div>
      </div>

      <div>
        <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Public reputation: requests, delivered intros, receiver accepts, spam blocked, and trust
          from helpful ratings. Private gate rules are never shown.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <Stat label="Requests" value={String(totals.requestCount)} />
        <Stat label="Delivered" value={String(totals.deliveredCount)} />
        <Stat label="Accepted" value={String(totals.acceptedCount)} />
        <Stat label="Spam blocked" value={String(totals.spamCount)} />
        <Stat label="Accept rate" value={formatPercent(totals.acceptRate)} />
        <Stat label="Trust score" value={formatPercent(totals.trustScore)} />
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
