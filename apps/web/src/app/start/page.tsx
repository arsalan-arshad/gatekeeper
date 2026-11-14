import Link from 'next/link';

import { auth } from '@/auth';
import { apiFetch } from '@/lib/api';

import { requestMagicLink, signOutAction } from './actions';
import { InterviewClient } from './interview-client';

export default async function StartPage() {
  const session = await auth();
  const email = session?.user?.email ?? null;

  let onboardedHandle: string | null = null;
  if (email) {
    try {
      const me = await apiFetch<{
        onboarded: boolean;
        user: { handle: string } | null;
      }>('/v1/onboarding/me', { email });
      if (me.onboarded && me.user) {
        onboardedHandle = me.user.handle;
      }
    } catch {
      onboardedHandle = null;
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">
          Gatekeeper
        </Link>
        {email ? (
          <form action={signOutAction}>
            <button type="submit" className="text-sm text-[var(--muted)] underline">
              Sign out
            </button>
          </form>
        ) : null}
      </div>

      <div>
        <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          Set up your front door
        </h1>
        <p className="mt-3 max-w-xl text-[var(--muted)]">
          Sign in with a magic link, answer five questions, edit the plain-English rules, and
          publish your public Gatekeeper page.
        </p>
      </div>

      {!email ? (
        <form action={requestMagicLink} className="flex max-w-md flex-col gap-3">
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
      ) : onboardedHandle ? (
        <div className="flex flex-col gap-3">
          <p>
            You&apos;re set up as <strong>@{onboardedHandle}</strong>.
          </p>
          <Link className="text-[var(--accent)] underline" href={`/@${onboardedHandle}`}>
            Open your public page
          </Link>
          <p className="text-sm text-[var(--muted)]">
            Want to refresh your rules? Continue the interview below to overwrite them.
          </p>
          <InterviewClient email={email} />
        </div>
      ) : (
        <InterviewClient email={email} />
      )}
    </main>
  );
}
