'use server';

import { auth } from '@/auth';
import { apiFetch } from '@/lib/api';

async function requireEmail() {
  const session = await auth();
  return session?.user?.email ?? null;
}

export type RulesPayload = {
  user: {
    handle: string;
    name: string;
    email: string;
    bio: string | null;
    wantsText: string | null;
    offersText: string | null;
    neverText: string | null;
  };
  gateRules: { ruleText: string; minRelevance: number } | null;
};

export async function loadRules() {
  const email = await requireEmail();
  if (!email) return { error: 'Sign in required' as const };
  try {
    const data = await apiFetch<RulesPayload>('/v1/dashboard/rules', { email });
    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to load rules' };
  }
}

export async function saveRules(input: {
  name: string;
  bio: string;
  handle: string;
  wantsText: string;
  offersText: string;
  neverText: string;
  ruleText: string;
  minRelevance: number;
}) {
  const email = await requireEmail();
  if (!email) return { error: 'Sign in required' };
  try {
    await apiFetch('/v1/dashboard/rules', {
      method: 'PUT',
      email,
      body: JSON.stringify(input),
    });
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Save failed';
    return { error: message === 'handle_taken' ? 'Handle already taken' : message };
  }
}

export async function testRulesMessage(message: string) {
  const email = await requireEmail();
  if (!email) return { error: 'Sign in required' };
  try {
    const data = await apiFetch<{
      judgment: {
        score: number;
        decision: string;
        reason_public: string;
        suggested_rewrite: string | null;
      };
    }>('/v1/dashboard/rules/test', {
      method: 'POST',
      email,
      body: JSON.stringify({ message }),
    });
    return { judgment: data.judgment };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Test failed' };
  }
}
