export type LedgerTotals = {
  requestCount: number;
  deliveredCount: number;
  acceptedCount: number;
  spamCount: number;
  helpfulCount: number;
  acceptRate: number;
  trustScore: number | null;
};

export type LedgerMonth = {
  month: string;
  requestCount: number;
  deliveredCount: number;
  acceptedCount: number;
  spamCount: number;
  helpfulCount: number;
  acceptRate: number;
};

export type LedgerPayload = {
  scope: 'global' | 'user';
  user?: { handle: string; name: string };
  totals: LedgerTotals;
  months: LedgerMonth[];
  /** True when aggregates include seeded demo traffic (or empty ledger). */
  includesDemoData?: boolean;
};

const EMPTY_TOTALS: LedgerTotals = {
  requestCount: 0,
  deliveredCount: 0,
  acceptedCount: 0,
  spamCount: 0,
  helpfulCount: 0,
  acceptRate: 0,
  trustScore: null,
};

/** Public ledger fallback when the API is unreachable — never requires auth. */
export function emptyGlobalLedger(): LedgerPayload {
  return { scope: 'global', totals: { ...EMPTY_TOTALS }, months: [] };
}

export function formatPercent(rate: number | null): string {
  if (rate === null || Number.isNaN(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}
