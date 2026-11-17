'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { captureEvent } from '@/lib/analytics/client';

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

const DRAFT_STEPS = [
  'Reading your answers',
  'Drafting plain-English rules',
  'Polishing profile copy',
] as const;

const DRAFT_TIMEOUT_MS = 15_000;

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
  const [directoryOptIn, setDirectoryOptIn] = useState(false);
  const [directoryRole, setDirectoryRole] = useState('');
  const [directoryTags, setDirectoryTags] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [draftStep, setDraftStep] = useState(0);
  const [drafting, setDrafting] = useState(false);
  const [pending, startTransition] = useTransition();
  const signupCaptured = useRef(false);

  const current = QUESTIONS[step];
  const progress = useMemo(() => `${Math.min(step + 1, 5)} / 5`, [step]);

  useEffect(() => {
    if (signupCaptured.current) return;
    signupCaptured.current = true;
    captureEvent('signup_completed');
  }, []);

  async function runDraft(withRetry = false) {
    setError(null);
    setDrafting(true);
    setDraftStep(0);

    const stepTimers = [
      window.setTimeout(() => setDraftStep(1), 400),
      window.setTimeout(() => setDraftStep(2), 1200),
    ];

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), DRAFT_TIMEOUT_MS);

    try {
      const result = await Promise.race([
        synthesizeRules(answers),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new Error('Draft timed out after 15s')),
          );
        }),
      ]);
      setDraft(result.profile);
      setHandle(result.profile.handleSuggestion);
      setDraftStep(DRAFT_STEPS.length - 1);
      captureEvent('interview_completed');
      captureEvent('rules_drafted');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not synthesize rules';
      if (withRetry) {
        setError(`${message}. Try again.`);
      } else {
        setError(message);
      }
    } finally {
      window.clearTimeout(timeout);
      for (const id of stepTimers) window.clearTimeout(id);
      setDrafting(false);
    }
  }

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

    void runDraft(false);
  }

  function saveProfile() {
    if (!draft) return;
    startTransition(async () => {
      const tags = directoryTags
        .split(/[,\s]+/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      const result = await completeOnboarding({
        handle,
        name: draft.name,
        bio: draft.bio,
        wantsText: draft.wantsText,
        offersText: draft.offersText,
        neverText: draft.neverText,
        ruleText: draft.ruleText,
        directoryOptIn,
        directoryRole: directoryOptIn ? directoryRole.trim() || null : null,
        directoryTags: directoryOptIn ? tags : [],
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      captureEvent('directory_opt_in', { enabled: directoryOptIn, surface: 'publish' });
    });
  }

  if (drafting) {
    return (
      <div className="flex flex-col gap-5">
        <h2 className="text-2xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          Drafting your rules
        </h2>
        <p className="text-sm text-[var(--muted)]">Usually under 15 seconds.</p>
        <ol className="flex flex-col gap-2">
          {DRAFT_STEPS.map((label, index) => (
            <li
              key={label}
              className={`text-sm ${
                index <= draftStep ? 'text-[var(--accent)]' : 'text-[var(--muted)]'
              }`}
            >
              {index < draftStep ? '✓' : index === draftStep ? '…' : '·'} {label}
            </li>
          ))}
        </ol>
      </div>
    );
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

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={directoryOptIn}
            onChange={(e) => setDirectoryOptIn(e.target.checked)}
          />
          <span>
            <span className="font-medium text-[var(--fg)]">
              List me in the Gatekeeper directory
            </span>
            <span className="mt-1 block text-[var(--muted)]">
              People can find you on /explore. Every intro still goes through your rules.
            </span>
          </span>
        </label>

        {directoryOptIn ? (
          <div className="flex flex-col gap-3 rounded-md border border-white/10 bg-black/20 p-4">
            <label className="flex flex-col gap-2 text-sm">
              Role (optional)
              <input
                className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
                value={directoryRole}
                onChange={(e) => setDirectoryRole(e.target.value)}
                maxLength={80}
                placeholder="e.g. Mobile engineer"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              Tags (optional, comma-separated)
              <input
                className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
                value={directoryTags}
                onChange={(e) => setDirectoryTags(e.target.value)}
                placeholder="e.g. saas, mobile, hiring"
              />
            </label>
          </div>
        ) : null}

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
      {error ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-red-300">{error}</p>
          {step >= QUESTIONS.length - 1 ? (
            <button
              type="button"
              onClick={() => void runDraft(true)}
              className="w-fit rounded-md border border-white/15 px-4 py-2 text-sm"
            >
              Retry draft
            </button>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        disabled={pending || drafting}
        onClick={submitAnswer}
        className="w-fit rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-60"
      >
        {step < QUESTIONS.length - 1 ? 'Continue' : 'Draft my rules'}
      </button>
    </div>
  );
}
