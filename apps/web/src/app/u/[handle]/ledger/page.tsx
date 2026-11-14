import { notFound } from 'next/navigation';

import { LedgerView } from '@/components/ledger-view';
import { API_URL } from '@/lib/api';
import { emptyGlobalLedger, type LedgerPayload } from '@/lib/ledger';

async function getUserLedger(
  handle: string,
): Promise<{ data: LedgerPayload | null; unavailable: boolean }> {
  try {
    const response = await fetch(`${API_URL}/v1/users/${encodeURIComponent(handle)}/ledger`, {
      cache: 'no-store',
    });
    if (response.status === 404) return { data: null, unavailable: false };
    if (!response.ok) {
      return {
        data: {
          ...emptyGlobalLedger(),
          scope: 'user',
          user: { handle: handle.toLowerCase(), name: handle },
        },
        unavailable: true,
      };
    }
    return { data: (await response.json()) as LedgerPayload, unavailable: false };
  } catch {
    return {
      data: {
        ...emptyGlobalLedger(),
        scope: 'user',
        user: { handle: handle.toLowerCase(), name: handle },
      },
      unavailable: true,
    };
  }
}

export default async function UserLedgerPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const { data, unavailable } = await getUserLedger(handle);
  if (!data || !data.user) notFound();

  return (
    <LedgerView
      data={data}
      title={`@${data.user.handle} ledger`}
      notice={
        unavailable
          ? 'Live totals are temporarily unavailable. This page stays public — try again shortly.'
          : undefined
      }
    />
  );
}
