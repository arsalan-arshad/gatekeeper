'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

import { bandFromDecision, captureEvent } from '@/lib/analytics';

type DemoResult = {
  score: number;
  decision: 'accept' | 'reject' | 'spam';
  reason_public: string;
  suggested_rewrite: string | null;
};

/** Rate-limited demo judge form for /@demo — email optional, verdict inline. */
export function DemoIntroForm({ handle }: { handle: string }) {
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limit, setLimit] = useState(20);
  const demoStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/demo/quota', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { remaining?: number; limit?: number };
        if (cancelled) return;
        if (typeof body.remaining === 'number') setRemaining(body.remaining);
        if (typeof body.limit === 'number') setLimit(body.limit);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function onSubmit(formData: FormData) {
    setError(null);
    setResult(null);
    if (!demoStarted.current) {
      demoStarted.current = true;
      captureEvent('demo_started', { surface: 'demo_profile' });
    }
    startTransition(async () => {
      const senderName = String(formData.get('senderName') ?? '').trim();
      const senderContact = String(formData.get('senderContact') ?? '').trim();
      const message = String(formData.get('message') ?? '').trim();

      if (!senderName || !message) {
        setError('Name and message are required');
        return;
      }

      try {
        const response = await fetch('/api/demo/judge', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            handle,
            message,
            senderName,
            ...(senderContact ? { senderContact } : {}),
          }),
        });
        const body = (await response.json().catch(() => ({}))) as DemoResult & {
          error?: string;
          remaining?: number;
          limit?: number;
        };
        if (typeof body.remaining === 'number') setRemaining(body.remaining);
        if (typeof body.limit === 'number') setLimit(body.limit);
        if (!response.ok) {
          if (response.status === 503 || /AI busy/i.test(body.error ?? '')) {
            setError('AI busy, try again');
          } else {
            setError(body.error || 'Could not judge request');
          }
          return;
        }
        setResult({
          score: body.score,
          decision: body.decision,
          reason_public: body.reason_public,
          suggested_rewrite: body.suggested_rewrite,
        });
        const band = bandFromDecision(body.decision);
        if (band) captureEvent('demo_submitted', { band });
      } catch {
        setError('AI busy, try again');
      }
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-3">
      <label className="text-sm">
        Your name
        <input
          required
          name="senderName"
          className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2"
        />
      </label>
      <label className="text-sm">
        Contact email <span className="text-[var(--muted)]">(optional)</span>
        <input
          type="email"
          name="senderContact"
          className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2"
        />
      </label>
      <label className="text-sm">
        Why the intro?
        <textarea
          required
          name="message"
          className="mt-2 min-h-32 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2"
        />
      </label>
      <p className="text-sm text-[var(--muted)]">
        {remaining == null
          ? `${limit} custom demo requests per IP per day`
          : `${remaining} of ${limit} custom demo requests remaining today`}
      </p>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {result ? (
        <div className="space-y-2 rounded-md border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-md px-2.5 py-1 text-sm font-semibold tracking-wide uppercase ${
                result.decision === 'accept'
                  ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                  : result.decision === 'spam'
                    ? 'bg-red-500/20 text-red-200'
                    : 'bg-amber-500/15 text-amber-100'
              }`}
            >
              {result.decision}
            </span>
            <p className="text-sm text-[var(--muted)]">
              Score <span className="text-[var(--fg)]">{result.score}</span>/100
            </p>
          </div>
          <p className="text-sm leading-relaxed text-[var(--fg)]">{result.reason_public}</p>
          {result.suggested_rewrite ? (
            <div className="pt-2">
              <p className="text-sm tracking-wide text-[var(--muted)] uppercase">
                Suggested rewrite
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--fg)]">
                {result.suggested_rewrite}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-60"
      >
        {pending ? 'Judging…' : 'Judge request'}
      </button>
    </form>
  );
}
