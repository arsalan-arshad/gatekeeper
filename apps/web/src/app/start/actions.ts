'use server';

import { AuthError } from 'next-auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { auth, signIn, signOut } from '@/auth';
import { apiFetch } from '@/lib/api';
import { MAGIC_LINK_SEND_FAILED_MESSAGE } from '@/lib/magic-link-email';

export type MagicLinkFormState = { error: string } | null;

function isNextRedirect(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest?: unknown }).digest === 'string' &&
    String((error as { digest: string }).digest).startsWith('NEXT_REDIRECT')
  );
}

function mapMagicLinkError(message: string): string {
  if (
    message === MAGIC_LINK_SEND_FAILED_MESSAGE ||
    /resend/i.test(message) ||
    message === 'Configuration' ||
    message === 'Verification'
  ) {
    return MAGIC_LINK_SEND_FAILED_MESSAGE;
  }
  return message;
}

export async function requestMagicLink(
  _prev: MagicLinkFormState,
  formData: FormData,
): Promise<MagicLinkFormState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  if (!email) {
    return { error: 'Email is required' };
  }

  try {
    const result = await signIn('resend', {
      email,
      redirectTo: '/dashboard',
      redirect: false,
    });

    if (result && typeof result === 'object' && 'error' in result && result.error) {
      return { error: mapMagicLinkError(String(result.error)) };
    }
  } catch (error) {
    if (isNextRedirect(error)) throw error;
    if (error instanceof AuthError) {
      return { error: mapMagicLinkError(error.message) };
    }
    if (error instanceof Error) {
      return { error: mapMagicLinkError(error.message) };
    }
    return { error: MAGIC_LINK_SEND_FAILED_MESSAGE };
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

function formatApiError(message: string): string {
  if (message === 'handle_taken') return 'Handle already taken';
  return message;
}

export async function completeOnboarding(input: {
  handle: string;
  name: string;
  bio: string;
  wantsText: string;
  offersText: string;
  neverText: string;
  ruleText: string;
  directoryOptIn?: boolean;
  directoryRole?: string | null;
  directoryTags?: string[];
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
    return {
      error: formatApiError(error instanceof Error ? error.message : 'Failed to save profile'),
    };
  }

  revalidatePath('/explore');
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
