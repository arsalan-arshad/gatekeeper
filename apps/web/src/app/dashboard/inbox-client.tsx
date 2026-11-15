'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

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

export function InboxClient({
  initialItems,
  initialFilter,
}: {
  initialItems: InboxItem[];
  initialFilter: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const filter = searchParams.get('filter') ?? initialFilter;

  function setFilter(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'all') params.delete('filter');
    else params.set('filter', next);
    router.push(params.toString() ? `/dashboard?${params}` : '/dashboard');
  }

  function run(action: () => Promise<{ error?: string; ok?: true }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
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

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      {initialItems.length === 0 ? (
        <p className="text-[var(--muted)]">No intro requests in this filter yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {initialItems.map((item) => (
            <li key={item.id} className="border-b border-white/10 pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[var(--fg)]">
                    {item.senderName}{' '}
                    <span className="text-sm font-normal text-[var(--muted)]">
                      · {item.senderType} · {item.senderContact}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {new Date(item.createdAt).toLocaleString()} · status {item.status}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold tracking-wide text-[var(--accent)] uppercase">
                    {item.decision ?? 'pending'}
                  </p>
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
                  onClick={() => run(() => approveRequest(item.id))}
                  className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-[#062015] disabled:opacity-50"
                >
                  Approve intro
                </button>
                <button
                  type="button"
                  disabled={pending || item.status === 'declined'}
                  onClick={() => run(() => declineRequest(item.id))}
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
                      item.decision ?? 'accept',
                    );
                    if (!next) return;
                    const decision = next.trim().toLowerCase();
                    if (decision !== 'accept' && decision !== 'reject' && decision !== 'spam') {
                      setError('Override must be accept, reject, or spam');
                      return;
                    }
                    run(() => overrideRequest(item.id, decision));
                  }}
                  className="rounded-md border border-white/15 px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  Override verdict
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => markSpam(item.id))}
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
