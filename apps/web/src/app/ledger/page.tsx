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
      demoData={false}
      notice={
        unavailable
          ? 'Live totals are temporarily unavailable. This page stays public — try again shortly.'
          : undefined
      }
    />
  );
}
