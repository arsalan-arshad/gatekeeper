'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { saveRules, testRulesMessage, type RulesPayload } from './actions';

export function RulesClient({ initial }: { initial: RulesPayload }) {
  const [name, setName] = useState(initial.user.name);
  const [bio, setBio] = useState(initial.user.bio ?? '');
  const [handle, setHandle] = useState(initial.user.handle);
  const [wantsText, setWantsText] = useState(initial.user.wantsText ?? '');
  const [offersText, setOffersText] = useState(initial.user.offersText ?? '');
  const [neverText, setNeverText] = useState(initial.user.neverText ?? '');
  const [ruleText, setRuleText] = useState(initial.gateRules?.ruleText ?? '');
  const [minRelevance, setMinRelevance] = useState(initial.gateRules?.minRelevance ?? 70);
  const [testMessage, setTestMessage] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveRules({
        name,
        bio,
        handle,
        wantsText,
        offersText,
        neverText,
        ruleText,
        minRelevance,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage('Saved.');
    });
  }

  function onTest() {
    setError(null);
    setTestResult(null);
    startTransition(async () => {
      const result = await testRulesMessage(testMessage);
      if (result.error) {
        setError(result.error);
        return;
      }
      const j = result.judgment!;
      setTestResult(
        `${j.decision} · ${j.score}/100 — ${j.reason_public}${
          j.suggested_rewrite ? `\nRewrite: ${j.suggested_rewrite}` : ''
        }`,
      );
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <label className="text-sm text-[var(--muted)]">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-[var(--fg)]"
        />
      </label>
      <label className="text-sm text-[var(--muted)]">
        Handle
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value.toLowerCase())}
          className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-[var(--fg)]"
        />
      </label>
      <label className="text-sm text-[var(--muted)]">
        Bio
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-[var(--fg)]"
        />
      </label>
      <label className="text-sm text-[var(--muted)]">
        Public Open to
        <textarea
          value={wantsText}
          onChange={(e) => setWantsText(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-[var(--fg)]"
        />
      </label>
      <label className="text-sm text-[var(--muted)]">
        Offers (public)
        <textarea
          value={offersText}
          onChange={(e) => setOffersText(e.target.value)}
          rows={2}
          className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-[var(--fg)]"
        />
      </label>
      <label className="text-sm text-[var(--muted)]">
        Never (private notes)
        <textarea
          value={neverText}
          onChange={(e) => setNeverText(e.target.value)}
          rows={2}
          className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-[var(--fg)]"
        />
      </label>
      <label className="text-sm text-[var(--muted)]">
        Private rules
        <textarea
          value={ruleText}
          onChange={(e) => setRuleText(e.target.value)}
          rows={8}
          className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-[var(--fg)]"
        />
      </label>
      <label className="text-sm text-[var(--muted)]">
        Min relevance ({minRelevance})
        <input
          type="range"
          min={0}
          max={100}
          value={minRelevance}
          onChange={(e) => setMinRelevance(Number(e.target.value))}
          className="mt-2 w-full"
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={onSave}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#062015] disabled:opacity-50"
        >
          Save
        </button>
        <Link href="/start?redo=1" className="rounded-md border border-white/15 px-4 py-2 text-sm">
          Redo interview (optional)
        </Link>
      </div>

      <section className="border-t border-white/10 pt-6">
        <h2 className="text-xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          Test a message
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Runs judgeRequest against your current saved rules (save first if you edited them).
        </p>
        <textarea
          value={testMessage}
          onChange={(e) => setTestMessage(e.target.value)}
          rows={4}
          className="mt-3 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-[var(--fg)]"
          placeholder="Paste a sample intro request…"
        />
        <button
          type="button"
          disabled={pending || !testMessage.trim()}
          onClick={onTest}
          className="mt-3 rounded-md border border-white/15 px-4 py-2 text-sm disabled:opacity-50"
        >
          Judge with current rules
        </button>
        {testResult ? (
          <pre className="mt-3 whitespace-pre-wrap rounded-md border border-white/10 bg-black/25 p-3 text-sm">
            {testResult}
          </pre>
        ) : null}
      </section>

      {message ? <p className="text-sm text-[var(--accent)]">{message}</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
