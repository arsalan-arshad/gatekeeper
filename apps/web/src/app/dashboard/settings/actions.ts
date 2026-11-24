'use server';

import { revalidatePath } from 'next/cache';

import { auth, signOut } from '@/auth';
import { apiFetch } from '@/lib/api';

async function requireEmail() {
  const session = await auth();
  return session?.user?.email ?? null;
}

export async function loadSettings() {
  const email = await requireEmail();
  if (!email) return { error: 'Sign in required' as const };
  try {
    const data = await apiFetch<{
      notificationEmailMode: 'instant' | 'daily_digest' | 'off';
      email: string;
      handle: string;
      introContactEmail: string | null;
      introContactVerified: boolean;
      introContactNeedsVerification: boolean;
      directoryOptIn: boolean;
      directoryRole: string | null;
      directoryTags: string[];
      directoryPromptDismissed: boolean;
    }>('/v1/dashboard/settings', { email });
    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to load settings' };
  }
}

export async function saveDirectorySettings(input: {
  optIn: boolean;
  role?: string | null;
  tags?: string[];
  dismissPrompt?: boolean;
}) {
  const email = await requireEmail();
  if (!email) return { error: 'Sign in required' };
  try {
    await apiFetch('/v1/dashboard/directory', {
      method: 'PUT',
      email,
      body: JSON.stringify(input),
    });
    revalidatePath('/explore');
    return { ok: true as const };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Save failed' };
  }
}

export async function saveSettings(input: {
  notificationEmailMode?: 'instant' | 'daily_digest' | 'off';
  introContactEmail?: string | null;
}) {
  const email = await requireEmail();
  if (!email) return { error: 'Sign in required' };
  try {
    const data = await apiFetch<{
      ok: true;
      introContactNeedsVerification?: boolean;
      verificationEmailSent?: boolean;
    }>('/v1/dashboard/settings', {
      method: 'PUT',
      email,
      body: JSON.stringify(input),
    });
    return {
      ok: true as const,
      introContactNeedsVerification: data.introContactNeedsVerification,
      verificationEmailSent: data.verificationEmailSent,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Save failed' };
  }
}

export async function resendIntroContactVerify() {
  const email = await requireEmail();
  if (!email) return { error: 'Sign in required' };
  try {
    await apiFetch('/v1/dashboard/settings/intro-contact/resend-verify', {
      method: 'POST',
      email,
      body: '{}',
    });
    return { ok: true as const };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Resend failed' };
  }
}

export async function exportData() {
  const email = await requireEmail();
  if (!email) return { error: 'Sign in required' };
  try {
    const data = await apiFetch<unknown>('/v1/dashboard/export', { email });
    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Export failed' };
  }
}

export async function deleteAccount() {
  const email = await requireEmail();
  if (!email) return { error: 'Sign in required' };
  try {
    await apiFetch('/v1/dashboard/account', { method: 'DELETE', email });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Delete failed' };
  }
  await signOut({ redirectTo: '/' });
  return { ok: true as const };
}
