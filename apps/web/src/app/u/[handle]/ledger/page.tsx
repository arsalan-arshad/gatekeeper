import { notFound } from 'next/navigation';

import { LedgerView } from '@/components/ledger-view';
import { API_URL } from '@/lib/api';
import type { LedgerPayload } from '@/lib/ledger';

async function getUserLedger(handle: string): Promise<LedgerPayload | null> {
  const response = await fetch(`${API_URL}/v1/users/${encodeURIComponent(handle)}/ledger`, {
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error('Failed to load ledger');
  }
  return (await response.json()) as LedgerPayload;
}

export default async function UserLedgerPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const data = await getUserLedger(handle);
  if (!data || !data.user) notFound();

  return <LedgerView data={data} title={`@${data.user.handle} ledger`} />;
}
