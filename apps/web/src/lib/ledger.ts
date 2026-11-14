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
};

export function formatPercent(rate: number | null): string {
  if (rate === null || Number.isNaN(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}
