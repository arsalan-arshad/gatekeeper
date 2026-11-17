import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { AnalyticsIdentify } from '@/components/analytics-identify';
import { MagicLinkForm } from '@/components/magic-link-form';
import { SignOutButton } from '@/components/sign-out-button';
import { SiteFooter } from '@/components/site-footer';
import { apiFetch } from '@/lib/api';
import { publicPageMetadata } from '@/lib/seo';
import { resolveStartDestination } from '@/lib/start-flow';

import { InterviewClient } from './interview-client';

export const metadata = publicPageMetadata({
  title: 'Set up your front door · Gatekeeper',
  description:
    'Sign in with a magic link, complete a short interview, and publish your public Gatekeeper handle.',
  path: '/start',
});

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ redo?: string }>;
}) {
  const session = await auth();
  const email = session?.user?.email ?? null;
  const params = await searchParams;
  const redo = params.redo === '1' || params.redo === 'true';

  let hasPublishedHandle = false;
  let userId: string | null = null;
  if (email) {
    try {
      const me = await apiFetch<{
        onboarded: boolean;
        user: { id: string; handle: string } | null;
      }>('/v1/onboarding/me', { email });
      if (me.onboarded && me.user) {
        hasPublishedHandle = true;
        userId = me.user.id;
      }
    } catch {
      hasPublishedHandle = false;
    }
  }

  const destination = resolveStartDestination({
    signedIn: Boolean(email),
    hasPublishedHandle,
    redo,
  });

  if (destination === 'dashboard') {
    redirect('/dashboard');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-sm uppercase tracking-[0.2em] text-[var(--accent)]">
          Gatekeeper
        </Link>
        {email ? <SignOutButton className="text-sm text-[var(--muted)] underline" /> : null}
      </div>

      {destination === 'magic_link' ? (
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
          <MagicLinkForm />
        </>
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
          {/* Sessioned users always land on interview — never the magic-link form. */}
          <InterviewClient email={email!} />
        </>
      )}
      {userId ? <AnalyticsIdentify userId={userId} /> : null}
      <SiteFooter />
    </main>
  );
}
