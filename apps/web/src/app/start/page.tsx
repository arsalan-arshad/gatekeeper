import Link from 'next/link';

import { auth } from '@/auth';
import { SiteFooter } from '@/components/site-footer';
import { apiFetch } from '@/lib/api';

import { requestMagicLink, signOutAction } from './actions';
import { InterviewClient } from './interview-client';

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ redo?: string }>;
}) {
  const session = await auth();
  const email = session?.user?.email ?? null;
  const params = await searchParams;
  const redo = params.redo === '1' || params.redo === 'true';

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

      {!email ? (
        <>
          <div>
            <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
              Set up your front door
            </h1>
            <p className="mt-3 max-w-xl text-[var(--muted)]">
              Sign in with a magic link, answer five questions, edit the plain-English rules, and
              publish your public Gatekeeper page.
            </p>
          </div>
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
        </>
      ) : onboardedHandle && !redo ? (
        <div className="flex flex-col gap-5">
          <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
            You&apos;re live as @{onboardedHandle}
          </h1>
          <p className="max-w-xl text-[var(--muted)]">
            Your Gatekeeper is published. Manage intros from the dashboard or share your public
            page.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black"
            >
              Dashboard
            </Link>
            <Link
              href={`/@${onboardedHandle}`}
              className="rounded-md border border-white/15 px-4 py-2 font-medium"
            >
              Public page
            </Link>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Need a fresh interview?{' '}
            <Link href="/start?redo=1" className="text-[var(--accent)] underline">
              Redo interview
            </Link>{' '}
            (optional — not the default).
          </p>
        </div>
      ) : (
        <>
          <div>
            <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
              {redo ? 'Redo your interview' : 'Set up your front door'}
            </h1>
            <p className="mt-3 max-w-xl text-[var(--muted)]">
              Answer five questions, edit the plain-English rules, and publish.
            </p>
          </div>
          <InterviewClient email={email} />
        </>
      )}
      <SiteFooter />
    </main>
  );
}
