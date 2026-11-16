import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { signIn } from '@/auth';
import { e2eSecretsEqual, isE2eLoginEnabled } from '@/lib/e2e-gate';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'E2E login · Gatekeeper',
};

async function e2eLoginAction(formData: FormData) {
  'use server';
  if (!isE2eLoginEnabled()) {
    notFound();
  }
  const expected = process.env.E2E_SECRET!.trim();
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const secret = String(formData.get('secret') ?? '');
  const redirectTo = String(formData.get('redirectTo') ?? '/start');
  if (!email || !e2eSecretsEqual(secret, expected)) {
    redirect('/e2e/login?error=1');
  }
  await signIn('e2e', { email, secret, redirectTo });
}

export default async function E2ELoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isE2eLoginEnabled()) {
    notFound();
  }
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
        E2E login
      </h1>
      <p className="text-sm text-[var(--muted)]">
        Staging/CI-only magic login. Disabled in production.
      </p>
      {params.error ? <p className="text-sm text-red-300">Invalid credentials</p> : null}
      <form action={e2eLoginAction} className="flex flex-col gap-3">
        <label className="text-sm">
          Email
          <input
            required
            type="email"
            name="email"
            data-testid="e2e-email"
            className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          Secret
          <input
            required
            type="password"
            name="secret"
            data-testid="e2e-secret"
            className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2"
          />
        </label>
        <input type="hidden" name="redirectTo" value="/start" />
        <button
          type="submit"
          data-testid="e2e-submit"
          className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black"
        >
          Sign in with test magic link
        </button>
      </form>
    </main>
  );
}
