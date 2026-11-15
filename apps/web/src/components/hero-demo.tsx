'use client';

import { useEffect, useState, useTransition } from 'react';

import { DoorGraphic, type DoorState } from '@/components/door-graphic';
import { DEMO_PLACEHOLDERS, DEMO_PROFILE_OPTIONS } from '@/lib/demo';

type DemoResult = {
  score: number;
  decision: 'accept' | 'reject' | 'spam';
  reason_public: string;
  suggested_rewrite: string | null;
};

export function HeroDemo() {
  const [handle, setHandle] = useState(DEMO_PROFILE_OPTIONS[0]!.handle);
  const [message, setMessage] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const profile = DEMO_PROFILE_OPTIONS.find((p) => p.handle === handle) ?? DEMO_PROFILE_OPTIONS[0]!;

  useEffect(() => {
    const id = window.setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % DEMO_PLACEHOLDERS.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, []);

  const doorState: DoorState = !result ? 'idle' : result.decision === 'accept' ? 'open' : 'closed';

  function onJudge() {
    setError(null);
    startTransition(async () => {
      const text = message.trim() || DEMO_PLACEHOLDERS[placeholderIndex]!;
      try {
        const response = await fetch('/api/demo/judge', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ handle, message: text, senderName: 'Demo visitor' }),
        });
        const body = (await response.json().catch(() => ({}))) as DemoResult & { error?: string };
        if (!response.ok) {
          setResult(null);
          setError(body.error || 'Could not judge request');
          return;
        }
        setResult({
          score: body.score,
          decision: body.decision,
          reason_public: body.reason_public,
          suggested_rewrite: body.suggested_rewrite,
        });
      } catch {
        setResult(null);
        setError('Demo API unreachable — start the API or try again.');
      }
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
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

        <button
          type="button"
          onClick={onJudge}
          disabled={pending}
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
                <p className="text-xs tracking-wide text-[var(--muted)] uppercase">
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

      <div className="flex flex-col items-center justify-center gap-4 py-2">
        <DoorGraphic state={doorState} />
        <p className="text-center text-sm text-[var(--muted)]">
          {doorState === 'open'
            ? 'Door open — forward for double opt-in'
            : doorState === 'closed'
              ? 'Door closed — spam and weak fits stay out'
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
      className={`rounded-md px-2.5 py-1 text-xs font-semibold tracking-wide uppercase ${styles}`}
    >
      {decision}
    </span>
  );
}
