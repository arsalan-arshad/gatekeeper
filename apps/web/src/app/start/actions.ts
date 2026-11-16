'use server';

import { SeverityNumber } from '@opentelemetry/api-logs';
import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';

import { auth, signIn, signOut } from '@/auth';
import { posthogLogsLogger, posthogLogsProvider } from '@/instrumentation';
import { apiFetch } from '@/lib/api';

export async function requestMagicLink(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  if (!email) {
    throw new Error('Email is required');
  }

  try {
    await signIn('resend', {
      email,
      redirectTo: '/dashboard',
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      throw new Error(error.message);
    }
    throw error;
  }

  redirect('/start/check-email');
}

export async function signOutAction() {
  await signOut({ redirectTo: '/start' });
}

export async function synthesizeRules(answers: {
  who: string;
  want: string;
  never: string;
  dealbreakers: string;
  format: string;
}) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    throw new Error('You must be signed in');
  }

  return apiFetch<{
    profile: {
      name: string;
      bio: string;
      wantsText: string;
      offersText: string;
      neverText: string;
      ruleText: string;
      handleSuggestion: string;
    };
  }>('/v1/onboarding/synthesize', {
    method: 'POST',
    email,
    body: JSON.stringify(answers),
  });
}

export async function completeOnboarding(input: {
  handle: string;
  name: string;
  bio: string;
  wantsText: string;
  offersText: string;
  neverText: string;
  ruleText: string;
}) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return { error: 'You must be signed in' };
  }

  try {
    await apiFetch<{ user: { handle: string } }>('/v1/onboarding/complete', {
      method: 'POST',
      email,
      body: JSON.stringify({ ...input, email }),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to save profile' };
  }

  posthogLogsLogger?.emit({
    body: 'Onboarding profile completed',
    severityNumber: SeverityNumber.INFO,
    attributes: { action: 'onboarding_completed' },
  });
  await posthogLogsProvider?.forceFlush().catch(() => {});

  redirect('/dashboard');
}

export async function loadOnboardingState() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return { session: null, me: null };
  }

  try {
    const me = await apiFetch<{
      onboarded: boolean;
      user: { handle: string; name: string } | null;
    }>('/v1/onboarding/me', { email });
    return { session, me };
  } catch {
    return { session, me: null };
  }
}
