'use server';

import { auth } from '@/auth';
import { apiFetch } from '@/lib/api';

async function requireEmail(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email ?? null;
}

export type InboxItem = {
  id: string;
  senderName: string;
  senderContact: string;
  senderType: string;
  message: string;
  /** AI verdict — never overwritten by owner actions. */
  decision: 'accept' | 'reject' | 'spam' | null;
  /** Owner's explicit decision when they approve/decline/override/mark spam. */
  ownerDecision: 'accept' | 'reject' | 'spam' | null;
  status: string;
  score: number | null;
  reason: string | null;
  createdAt: string;
};

export async function loadInbox(filter: string = 'all') {
  const email = await requireEmail();
  if (!email) return { error: 'Sign in required' as const };
  try {
    const data = await apiFetch<{ filter: string; items: InboxItem[] }>(
      `/v1/dashboard/inbox?filter=${encodeURIComponent(filter)}`,
      { email },
    );
    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to load inbox' };
  }
}

export async function approveRequest(id: string) {
  const email = await requireEmail();
  if (!email) return { error: 'Sign in required' };
  try {
    await apiFetch(`/v1/dashboard/inbox/${id}/approve`, { method: 'POST', email, body: '{}' });
    return { ok: true as const };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Approve failed' };
  }
}

export async function declineRequest(id: string) {
  const email = await requireEmail();
  if (!email) return { error: 'Sign in required' };
  try {
    await apiFetch(`/v1/dashboard/inbox/${id}/decline`, { method: 'POST', email, body: '{}' });
    return { ok: true as const };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Decline failed' };
  }
}

export async function overrideRequest(id: string, decision: 'accept' | 'reject' | 'spam') {
  const email = await requireEmail();
  if (!email) return { error: 'Sign in required' };
  try {
    await apiFetch(`/v1/dashboard/inbox/${id}/override`, {
      method: 'POST',
      email,
      body: JSON.stringify({ decision }),
    });
    return { ok: true as const };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Override failed' };
  }
}

export async function markSpam(id: string) {
  const email = await requireEmail();
  if (!email) return { error: 'Sign in required' };
  try {
    await apiFetch(`/v1/dashboard/inbox/${id}/spam`, { method: 'POST', email, body: '{}' });
    return { ok: true as const };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Mark spam failed' };
  }
}

export async function loadMe() {
  const email = await requireEmail();
  if (!email) return { email: null, me: null };
  try {
    const me = await apiFetch<{
      onboarded: boolean;
      user: { handle: string; name: string } | null;
    }>('/v1/onboarding/me', { email });
    return { email, me };
  } catch {
    return { email, me: null };
  }
}
