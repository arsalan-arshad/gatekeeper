'use client';

import { requestMagicLink } from '@/app/start/actions';
import { captureEvent } from '@/lib/analytics/client';

export function MagicLinkForm() {
  return (
    <form
      action={requestMagicLink}
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
      <button
        type="submit"
        className="w-fit rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black"
      >
        Email me a magic link
      </button>
    </form>
  );
}
