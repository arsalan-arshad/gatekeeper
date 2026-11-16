import { LedgerView } from '@/components/ledger-view';
import { API_URL } from '@/lib/api';
import { emptyGlobalLedger, type LedgerPayload } from '@/lib/ledger';
import { publicPageMetadata } from '@/lib/seo';

export const metadata = publicPageMetadata({
  title: 'Public ledger · Gatekeeper',
  description:
    'Public Gatekeeper ledger — accept rates, spam blocked, and trust signals across the network.',
  path: '/ledger',
});

async function getGlobalLedger(): Promise<{ data: LedgerPayload; unavailable: boolean }> {
  try {
    const response = await fetch(`${API_URL}/v1/ledger`, { cache: 'no-store' });
    if (!response.ok) {
      return { data: emptyGlobalLedger(), unavailable: true };
    }
    return { data: (await response.json()) as LedgerPayload, unavailable: false };
  } catch {
    // Public page: never throw a server exception if the API is down.
    return { data: emptyGlobalLedger(), unavailable: true };
  }
}

export default async function GlobalLedgerPage() {
  const { data, unavailable } = await getGlobalLedger();
  // Pill whenever seeded demo rows contribute, ledger is empty/unavailable, or the API
  // omits the flag (treat as sample until real non-demo volume sets includesDemoData=false).
  const demoData = unavailable || data.totals.requestCount === 0 || data.includesDemoData !== false;

  return (
    <LedgerView
      data={data}
      title="Public ledger"
      demoData={demoData}
      notice={
        unavailable
          ? 'Live totals are temporarily unavailable. Showing Demo data — sample stats until the API is back.'
          : demoData
            ? 'Includes seeded demo traffic — Demo data — sample stats marks sample ledger rows.'
            : undefined
      }
    />
  );
}
