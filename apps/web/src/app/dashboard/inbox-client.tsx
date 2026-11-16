'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { captureEvent } from '@/lib/analytics/client';

import {
  approveRequest,
  declineRequest,
  markSpam,
  overrideRequest,
  type InboxItem,
} from './actions';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'spam', label: 'Spam' },
] as const;

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'accepted':
      return 'border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)]';
    case 'declined':
      return 'border-red-400/30 bg-red-400/10 text-red-200';
    case 'delivered':
      return 'border-sky-400/30 bg-sky-400/10 text-sky-200';
    default:
      return 'border-white/15 bg-white/5 text-[var(--muted)]';
  }
}

function formatDecisionLabel(decision: 'accept' | 'reject' | 'spam'): string {
  switch (decision) {
    case 'accept':
      return 'Approved';
    case 'reject':
      return 'Declined';
    case 'spam':
      return 'SPAM';
  }
}

function formatAiVerdict(item: InboxItem): string {
  const label = (item.decision ?? 'pending').toUpperCase();
  if (item.score == null) return `AI: ${label}`;
  // Spec example: "AI: REJECT 44"
  return `AI: ${label} ${item.score}`;
}

function VerdictBadge({ item }: { item: InboxItem }) {
  const ai = formatAiVerdict(item);
  if (!item.ownerDecision) {
    return (
      <p
        data-testid="inbox-verdict-badge"
        className="font-semibold tracking-wide text-[var(--accent)] uppercase"
      >
        {ai}
      </p>
    );
  }
  const owner = formatDecisionLabel(item.ownerDecision);
  return (
    <p
      data-testid="inbox-verdict-badge"
      className="max-w-[16rem] text-right text-sm font-semibold tracking-wide text-[var(--accent)]"
    >
      {ai} · Owner: {owner}
    </p>
  );
}

export function InboxClient({
  initialItems,
  initialFilter,
}: {
  initialItems: InboxItem[];
  initialFilter: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const filter = searchParams.get('filter') ?? initialFilter;

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function setFilter(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.delete('filter');
    else params.set('filter', next);
    router.push(params.toString() ? `/dashboard?${params}` : '/dashboard');
  }

  function patchItem(id: string, patch: Partial<InboxItem>) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function run(
    item: InboxItem,
    action: () => Promise<{ error?: string; ok?: true }>,
    next: Partial<InboxItem>,
    message: string,
    analytics?: 'owner_approved' | 'owner_rejected',
  ) {
    setError(null);
    // Optimistic status badge before the server round-trip finishes.
    // Never overwrite AI decision/score/reason — only status + ownerDecision.
    patchItem(item.id, next);
    setToast(message);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        setToast(null);
        patchItem(item.id, {
          status: item.status,
          decision: item.decision,
          ownerDecision: item.ownerDecision,
          score: item.score,
          reason: item.reason,
        });
        return;
      }
      if (analytics) captureEvent(analytics);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              filter === f.id
                ? 'bg-[var(--accent)]/15 text-[var(--accent)]'
                : 'border border-white/10 text-[var(--muted)] hover:text-[var(--fg)]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {toast ? (
        <p
          role="status"
          data-testid="inbox-toast"
          className="rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-sm text-[var(--accent)]"
        >
          {toast}
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      {items.length === 0 ? (
        <p className="text-[var(--muted)]">No intro requests in this filter yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.id} className="border-b border-white/10 pb-4" data-testid="inbox-row">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[var(--fg)]">
                    {item.senderName}{' '}
                    <span className="text-sm font-normal text-[var(--muted)]">
                      · {item.senderType} · {item.senderContact}
                    </span>
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
                    <span>{new Date(item.createdAt).toLocaleString()}</span>
                    <span
                      data-testid="inbox-status-badge"
                      className={`rounded-md border px-2 py-0.5 text-xs font-semibold tracking-wide uppercase ${statusBadgeClass(item.status)}`}
                    >
                      {item.status}
                    </span>
                  </p>
                </div>
                <div className="text-right text-sm">
                  <VerdictBadge item={item} />
                  <p className="text-[var(--muted)]">
                    Score {item.score == null ? '—' : `${item.score}/100`}
                  </p>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-[var(--fg)]">{item.message}</p>
              {item.reason ? (
                <p className="mt-2 text-sm text-[var(--muted)]">Reason: {item.reason}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending || item.status === 'accepted'}
                  onClick={() =>
                    run(
                      item,
                      () => approveRequest(item.id),
                      { status: 'accepted', ownerDecision: 'accept' },
                      `Intro sent to ${item.senderName}`,
                      'owner_approved',
                    )
                  }
                  className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[#062015] disabled:opacity-50"
                >
                  Approve intro
                </button>
                <button
                  type="button"
                  disabled={pending || item.status === 'declined'}
                  onClick={() =>
                    run(
                      item,
                      () => declineRequest(item.id),
                      { status: 'declined', ownerDecision: 'reject' },
                      `Declined ${item.senderName}`,
                      'owner_rejected',
                    )
                  }
                  className="rounded-md border border-white/15 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Decline
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    const next = window.prompt(
                      'Override verdict to (accept / reject / spam):',
                      item.ownerDecision ?? item.decision ?? 'accept',
                    );
                    if (!next) return;
                    const decision = next.trim().toLowerCase();
                    if (decision !== 'accept' && decision !== 'reject' && decision !== 'spam') {
                      setError('Override must be accept, reject, or spam');
                      return;
                    }
                    const nextStatus =
                      decision === 'accept'
                        ? 'delivered'
                        : decision === 'spam'
                          ? 'pending'
                          : 'pending';
                    run(
                      item,
                      () => overrideRequest(item.id, decision),
                      { ownerDecision: decision, status: nextStatus },
                      `Overrode ${item.senderName} → ${decision}`,
                    );
                  }}
                  className="rounded-md border border-white/15 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Override verdict
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(
                      item,
                      () => markSpam(item.id),
                      { status: 'declined', ownerDecision: 'spam' },
                      `Marked ${item.senderName} as spam`,
                    )
                  }
                  className="rounded-md border border-red-400/30 px-3 py-1.5 text-sm text-red-200 disabled:opacity-50"
                >
                  Mark spam
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
