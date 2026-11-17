'use client';

import { useActionState } from 'react';

import { requestMagicLink, type MagicLinkFormState } from '@/app/start/actions';
import { captureEvent } from '@/lib/analytics/client';

const initialState: MagicLinkFormState = null;

export function MagicLinkForm() {
  const [state, formAction, pending] = useActionState(requestMagicLink, initialState);

  return (
    <form
      action={formAction}
      onSubmit={() => {
        captureEvent('signup_started');
      }}
      className="flex max-w-md flex-col gap-3"
    >
      <label className="text-sm">
        Work email
        <input
          required
          type="email"
          name="email"
          placeholder="you@company.com"
          className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2"
        />
      </label>
      {state?.error ? <p className="text-sm text-red-300">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Email me a magic link'}
      </button>
    </form>
  );
}
