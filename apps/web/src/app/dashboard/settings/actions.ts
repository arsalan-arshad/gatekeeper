'use server';

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
    return { ok: true as const };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Save failed' };
  }
}

export async function saveSettings(notificationEmailMode: 'instant' | 'daily_digest' | 'off') {
  const email = await requireEmail();
  if (!email) return { error: 'Sign in required' };
  try {
    await apiFetch('/v1/dashboard/settings', {
      method: 'PUT',
      email,
      body: JSON.stringify({ notificationEmailMode }),
    });
    return { ok: true as const };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Save failed' };
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
