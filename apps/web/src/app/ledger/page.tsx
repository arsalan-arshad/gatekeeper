import { API_URL } from '@/lib/api';
import { emptyGlobalLedger, type LedgerPayload } from '@/lib/ledger';
import { LedgerView } from '@/components/ledger-view';

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
  return (
    <LedgerView
      data={data}
      title="Public ledger"
      demoData={unavailable || data.totals.requestCount === 0}
      notice={
        unavailable
          ? 'Live totals are temporarily unavailable. Showing Demo data placeholder until the API is back.'
          : data.totals.requestCount === 0
            ? 'No live traffic yet — Demo data badge marks empty public ledgers.'
            : undefined
      }
    />
  );
}
