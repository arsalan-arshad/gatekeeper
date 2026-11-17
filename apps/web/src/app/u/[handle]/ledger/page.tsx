import type { Metadata } from 'next';

import { LedgerView } from '@/components/ledger-view';
import { NotFoundView } from '@/components/not-found-view';
import { API_URL } from '@/lib/api';
import { BRAND } from '@/lib/brand';
import { DEMO_LEDGER_FALLBACK } from '@/lib/demo';
import { handleNotFoundMetadata } from '@/lib/handle-not-found-meta';
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
      demoData:
        normalized === 'demo' ||
        payload.includesDemoData === true ||
        payload.totals.requestCount === 0,
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const normalized = handle.toLowerCase();
  const { data } = await getUserLedger(handle);
  if (!data || !data.user) {
    // Soft fallback — hard 404 for known-missing handles is middleware.
    return handleNotFoundMetadata;
  }
  const title = `@${normalized} public ledger · Gatekeeper`;
  const description = `Public Gatekeeper ledger for @${normalized} — accept rates, spam blocked, and trust signals.`;
  const url = `${BRAND.siteUrl}/@${normalized}/ledger`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      images: [{ url: '/og.png', width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og.png'],
    },
  };
}

export default async function UserLedgerPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const { data, unavailable, demoData } = await getUserLedger(handle);
  // Avoid notFound() so we keep a single noindex,nofollow meta (see handle page).
  if (!data || !data.user) return <NotFoundView />;

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
