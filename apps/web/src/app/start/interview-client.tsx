'use client';

import { useMemo, useState, useTransition } from 'react';

import { completeOnboarding, synthesizeRules } from './actions';

const QUESTIONS = [
  {
    id: 'who',
    prompt: 'Who are you? Briefly share your role, context, and what you work on.',
  },
  {
    id: 'want',
    prompt: 'What do you want more of? (intros, opportunities, kinds of people)',
  },
  {
    id: 'never',
    prompt: 'What do you never want to hear about?',
  },
  {
    id: 'dealbreakers',
    prompt: 'What are your deal-breakers for accepting an intro?',
  },
  {
    id: 'format',
    prompt: 'Preferred intro format — length, tone, and what senders should include?',
  },
] as const;

type Answers = Record<(typeof QUESTIONS)[number]['id'], string>;

type ProfileDraft = {
  name: string;
  bio: string;
  wantsText: string;
  offersText: string;
  neverText: string;
  ruleText: string;
  handleSuggestion: string;
};

export function InterviewClient({ email }: { email: string }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({
    who: '',
    want: '',
    never: '',
    dealbreakers: '',
    format: '',
  });
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [handle, setHandle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const current = QUESTIONS[step];
  const progress = useMemo(() => `${Math.min(step + 1, 5)} / 5`, [step]);

  function submitAnswer() {
    if (!current) return;
    const value = answers[current.id].trim();
    if (!value) {
      setError('Please answer before continuing.');
      return;
    }
    setError(null);

    if (step < QUESTIONS.length - 1) {
      setStep((s) => s + 1);
      return;
    }

    startTransition(async () => {
      try {
        const { profile } = await synthesizeRules(answers);
        setDraft(profile);
        setHandle(profile.handleSuggestion);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not synthesize rules');
      }
    });
  }

  function saveProfile() {
    if (!draft) return;
    startTransition(async () => {
      const result = await completeOnboarding({
        handle,
        name: draft.name,
        bio: draft.bio,
        wantsText: draft.wantsText,
        offersText: draft.offersText,
        neverText: draft.neverText,
        ruleText: draft.ruleText,
      });
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  if (draft) {
    return (
      <div className="flex flex-col gap-5">
        <p className="text-sm text-[var(--muted)]">Signed in as {email}</p>
        <h2 className="text-2xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          Edit your gate rules
        </h2>
        <p className="text-[var(--muted)]">
          Plain English your Gatekeeper will use. Nothing here is shown on your public page.
        </p>

        <label className="flex flex-col gap-2 text-sm">
          Public handle
          <input
            className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            pattern="[a-z0-9-]+"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm">
          Name
          <input
            className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-2 text-sm">
          Bio (public)
          <textarea
            className="min-h-24 rounded-md border border-white/15 bg-black/30 px-3 py-2"
            value={draft.bio}
            onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
          />
        </label>

        <label className="flex flex-col gap-2 text-sm">
          Gate rules (private)
          <textarea
            className="min-h-40 rounded-md border border-white/15 bg-black/30 px-3 py-2"
            value={draft.ruleText}
            onChange={(e) => setDraft({ ...draft, ruleText: e.target.value })}
          />
        </label>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <button
          type="button"
          disabled={pending}
          onClick={saveProfile}
          className="w-fit rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Publish my Gatekeeper'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-[var(--muted)]">
        Signed in as {email} · Question {progress}
      </p>
      <div className="rounded-lg border border-white/10 bg-black/20 p-4">
        <p className="text-sm uppercase tracking-wide text-[var(--accent)]">Gatekeeper</p>
        <p className="mt-2 text-lg">{current?.prompt}</p>
      </div>
      <textarea
        className="min-h-32 rounded-md border border-white/15 bg-black/30 px-3 py-2"
        placeholder="Type your answer…"
        value={current ? answers[current.id] : ''}
        onChange={(e) => {
          if (!current) return;
          setAnswers((prev) => ({ ...prev, [current.id]: e.target.value }));
        }}
      />
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      <button
        type="button"
        disabled={pending}
        onClick={submitAnswer}
        className="w-fit rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-60"
      >
        {pending ? 'Thinking…' : step < QUESTIONS.length - 1 ? 'Continue' : 'Draft my rules'}
      </button>
    </div>
  );
}
