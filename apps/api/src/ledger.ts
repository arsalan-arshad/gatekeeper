/**
 * Trust score = helpful accepted intros / total delivered (AI-accepted) intros.
 * Returns null when there are no delivered intros yet.
 */
export function computeTrustScore(helpfulCount: number, deliveredCount: number): number | null {
  if (deliveredCount <= 0) return null;
  return Number((helpfulCount / deliveredCount).toFixed(4));
}

/**
 * Accept rate = receiver-accepted intros / total requests (0 when total is 0).
 * Distinct from delivered (AI-accepted / forwarded for opt-in).
 */
export function computeAcceptRate(acceptedCount: number, totalRequests: number): number {
  if (totalRequests <= 0) return 0;
  return Number((acceptedCount / totalRequests).toFixed(4));
}

/** Seeded demo profile handles from `packages/db/src/seed.ts`. */
export const DEMO_LEDGER_HANDLES = ['demo', 'ada', 'jonas', 'mira'] as const;

/** True when ledger traffic includes seeded demo profiles (or is empty / unavailable on the client). */
export function isDemoLedgerHandle(handle: string | null | undefined): boolean {
  if (!handle) return false;
  return (DEMO_LEDGER_HANDLES as readonly string[]).includes(handle.toLowerCase());
}

export type LedgerMonthRow = {
  month: string;
  requestCount: number;
  deliveredCount: number;
  acceptedCount: number;
  spamCount: number;
  helpfulCount: number;
  acceptRate: number;
};

export type LedgerSummary = {
  requestCount: number;
  deliveredCount: number;
  acceptedCount: number;
  spamCount: number;
  helpfulCount: number;
  acceptRate: number;
  trustScore: number | null;
};

export function summarizeLedgerMonths(months: LedgerMonthRow[]): LedgerSummary {
  const summary = months.reduce(
    (acc, row) => {
      acc.requestCount += row.requestCount;
      acc.deliveredCount += row.deliveredCount;
      acc.acceptedCount += row.acceptedCount;
      acc.spamCount += row.spamCount;
      acc.helpfulCount += row.helpfulCount;
      return acc;
    },
    {
      requestCount: 0,
      deliveredCount: 0,
      acceptedCount: 0,
      spamCount: 0,
      helpfulCount: 0,
    },
  );

  return {
    ...summary,
    acceptRate: computeAcceptRate(summary.acceptedCount, summary.requestCount),
    trustScore: computeTrustScore(summary.helpfulCount, summary.deliveredCount),
  };
}

export function formatMonthLabel(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toISOString().slice(0, 7);
}
