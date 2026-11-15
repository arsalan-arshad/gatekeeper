'use client';

import { useEffect, useState, useTransition } from 'react';

import { DoorGraphic, type DoorState } from '@/components/door-graphic';
import { DEMO_CHIPS, DEMO_PLACEHOLDERS, DEMO_PROFILE_OPTIONS } from '@/lib/demo';

type DemoResult = {
  score: number;
  decision: 'accept' | 'reject' | 'spam';
  reason_public: string;
  suggested_rewrite: string | null;
  remaining?: number;
  limit?: number;
};

export function HeroDemo() {
  const [handle, setHandle] = useState(DEMO_PROFILE_OPTIONS[0]!.handle);
  const [message, setMessage] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [slamKey, setSlamKey] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limit, setLimit] = useState(20);

  const profile = DEMO_PROFILE_OPTIONS.find((p) => p.handle === handle) ?? DEMO_PROFILE_OPTIONS[0]!;
  const canJudge = message.trim().length > 0;

  useEffect(() => {
    const id = window.setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % DEMO_PLACEHOLDERS.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, []);

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
        /* quota is best-effort for UI */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const doorState: DoorState = !result ? 'idle' : result.decision === 'accept' ? 'open' : 'closed';

  function judge(text: string, example: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch('/api/demo/judge', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            handle,
            message: text,
            senderName: 'Demo visitor',
            example,
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
          setResult(null);
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
          remaining: body.remaining,
          limit: body.limit,
        });
        if (body.decision !== 'accept') {
          setSlamKey((k) => k + 1);
        }
      } catch {
        setResult(null);
        setError('AI busy, try again');
      }
    });
  }

  function applyChip(chipId: (typeof DEMO_CHIPS)[number]['id']) {
    const chip = DEMO_CHIPS.find((c) => c.id === chipId);
    if (!chip) return;
    setMessage(chip.message);
    setResult(null);
    setError(null);
    // Example chips never decrement the custom-request counter.
    judge(chip.message, true);
  }

  function onJudge() {
    const text = message.trim();
    if (!text) {
      setError('Enter a message to judge');
      return;
    }
    judge(text, false);
  }

  return (
    <div className="grid gap-8 md:grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
      <div className="rounded-xl border border-white/10 bg-black/25 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium tracking-wide text-[var(--accent)] uppercase">
            Try it now
          </p>
          <p className="text-sm text-[var(--muted)]">No signup</p>
        </div>

        <label className="mt-4 block text-sm text-[var(--muted)]">
          Demo profile
          <select
            value={handle}
            onChange={(e) => {
              setHandle(e.target.value);
              setResult(null);
              setError(null);
            }}
            className="mt-2 w-full rounded-md border border-white/15 bg-[#0a110e] px-3 py-2.5 text-[var(--fg)]"
          >
            {DEMO_PROFILE_OPTIONS.map((p) => (
              <option key={p.handle} value={p.handle}>
                @{p.handle} — {p.label}
              </option>
            ))}
          </select>
        </label>

        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          <span className="text-[var(--fg)]">{profile.name}</span> · {profile.bio}
        </p>

        <label className="mt-5 block text-sm text-[var(--muted)]">
          Your request
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={DEMO_PLACEHOLDERS[placeholderIndex]}
            rows={4}
            className="mt-2 w-full resize-y rounded-md border border-white/15 bg-[#0a110e] px-3 py-2.5 text-[var(--fg)] placeholder:text-[var(--muted)]/70"
          />
        </label>

        <p className="mt-2 text-sm text-[var(--muted)]">
          {remaining == null
            ? `${limit} custom demo requests per IP per day · example chips do not count`
            : `${remaining} of ${limit} custom demo requests remaining today · example chips free`}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {DEMO_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => applyChip(chip.id)}
              className="rounded-md border border-white/15 px-3 py-1.5 text-sm text-[var(--muted)] transition hover:border-[var(--accent)]/40 hover:text-[var(--fg)]"
            >
              {chip.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onJudge}
          disabled={pending || !canJudge}
          className="mt-4 rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[#062015] transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? 'Judging…' : 'Judge request'}
        </button>

        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}

        {result ? (
          <div className="mt-5 space-y-3 border-t border-white/10 pt-5">
            <div className="flex flex-wrap items-center gap-3">
              <DecisionBadge decision={result.decision} />
              <p className="text-sm text-[var(--muted)]">
                Score <span className="text-[var(--fg)]">{result.score}</span>/100
              </p>
            </div>
            <p className="leading-relaxed text-[var(--fg)]">{result.reason_public}</p>
            {result.suggested_rewrite ? (
              <div className="rounded-md border border-white/10 bg-black/20 p-3">
                <p className="text-sm tracking-wide text-[var(--muted)] uppercase">
                  Suggested rewrite
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--fg)]">
                  {result.suggested_rewrite}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col items-center justify-center gap-4 py-2" key={slamKey}>
        <DoorGraphic state={doorState} />
        <p className="text-center text-sm text-[var(--muted)]">
          {doorState === 'open'
            ? 'Door open — forward for double opt-in'
            : doorState === 'closed'
              ? 'Door slammed — spam and weak fits stay out'
              : 'Your AI front door waits for a judgment'}
        </p>
      </div>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: DemoResult['decision'] }) {
  const styles =
    decision === 'accept'
      ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
      : decision === 'spam'
        ? 'bg-red-500/20 text-red-200'
        : 'bg-amber-500/15 text-amber-100';
  return (
    <span
      className={`rounded-md px-2.5 py-1 text-sm font-semibold tracking-wide uppercase ${styles}`}
    >
      {decision}
    </span>
  );
}
