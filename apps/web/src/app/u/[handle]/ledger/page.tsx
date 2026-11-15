import { notFound } from 'next/navigation';

import { LedgerView } from '@/components/ledger-view';
import { API_URL } from '@/lib/api';
import { DEMO_LEDGER_FALLBACK } from '@/lib/demo';
import { emptyGlobalLedger, type LedgerPayload } from '@/lib/ledger';

async function getUserLedger(handle: string): Promise<{
  data: LedgerPayload | null;
  unavailable: boolean;
  demoData: boolean;
}> {
  const normalized = handle.toLowerCase();
  try {
    const response = await fetch(`${API_URL}/v1/users/${encodeURIComponent(normalized)}/ledger`, {
      cache: 'no-store',
    });
    if (response.status === 404) {
      if (normalized === 'demo') {
        return { data: DEMO_LEDGER_FALLBACK, unavailable: false, demoData: true };
      }
      return { data: null, unavailable: false, demoData: false };
    }
    if (!response.ok) {
      if (normalized === 'demo') {
        return { data: DEMO_LEDGER_FALLBACK, unavailable: true, demoData: true };
      }
      return {
        data: {
          ...emptyGlobalLedger(),
          scope: 'user',
          user: { handle: normalized, name: handle },
        },
        unavailable: true,
        demoData: false,
      };
    }
    const payload = (await response.json()) as LedgerPayload;
    return {
      data: payload,
      unavailable: false,
      demoData: normalized === 'demo',
    };
  } catch {
    if (normalized === 'demo') {
      return { data: DEMO_LEDGER_FALLBACK, unavailable: true, demoData: true };
    }
    return {
      data: {
        ...emptyGlobalLedger(),
        scope: 'user',
        user: { handle: normalized, name: handle },
      },
      unavailable: true,
      demoData: false,
    };
  }
}

export default async function UserLedgerPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const { data, unavailable, demoData } = await getUserLedger(handle);
  if (!data || !data.user) notFound();

  return (
    <LedgerView
      data={data}
      title={`@${data.user.handle} ledger`}
      demoData={demoData}
      notice={
        unavailable
          ? demoData
            ? 'Showing seeded demo ledger while live totals are unavailable.'
            : 'Live totals are temporarily unavailable. This page stays public — try again shortly.'
          : demoData
            ? 'Seeded demo traffic for product previews.'
            : undefined
      }
    />
  );
}
