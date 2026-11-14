import { API_URL } from '@/lib/api';
import type { LedgerPayload } from '@/lib/ledger';
import { LedgerView } from '@/components/ledger-view';

async function getGlobalLedger(): Promise<LedgerPayload> {
  const response = await fetch(`${API_URL}/v1/ledger`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to load ledger');
  }
  return (await response.json()) as LedgerPayload;
}

export default async function GlobalLedgerPage() {
  const data = await getGlobalLedger();
  return <LedgerView data={data} title="Public ledger" />;
}
