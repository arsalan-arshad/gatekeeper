import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { CheckEmailAnalytics } from '@/components/check-email-analytics';
import { apiFetch } from '@/lib/api';
import { publicPageMetadata } from '@/lib/seo';
import { resolveStartDestination } from '@/lib/start-flow';

export const metadata = publicPageMetadata({
  title: 'Check your email · Gatekeeper',
  description: 'Open the magic link we sent to continue signing in to Gatekeeper.',
  path: '/start/check-email',
  robots: { index: false, follow: false },
});

export default async function CheckEmailPage() {
  const session = await auth();
  const email = session?.user?.email ?? null;

  if (email) {
    let hasPublishedHandle = false;
    try {
      const me = await apiFetch<{
        onboarded: boolean;
        user: { handle: string } | null;
      }>('/v1/onboarding/me', { email });
      hasPublishedHandle = Boolean(me.onboarded && me.user?.handle);
    } catch {
      hasPublishedHandle = false;
    }

    const destination = resolveStartDestination({
      signedIn: true,
      hasPublishedHandle,
    });
    if (destination === 'dashboard') {
      redirect('/dashboard');
    }
    // Signed in, no published handle → interview (skip magic-link / check-email).
    redirect('/start');
  }

  const showDevConsoleHint = process.env.NODE_ENV !== 'production' && !process.env.RESEND_API_KEY;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6 py-16">
      <CheckEmailAnalytics />
      <h1 className="text-3xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
        Check your email
      </h1>
      <p className="text-[var(--muted)]">
        We sent a magic link to your inbox. Open it to continue signing in.
        {showDevConsoleHint ? (
          <>
            {' '}
            In local dev without <code>RESEND_API_KEY</code>, the link is printed in the web server
            console.
          </>
        ) : null}
      </p>
      <Link className="text-[var(--accent)] underline" href="/start">
        Back to start
      </Link>
    </main>
  );
}
