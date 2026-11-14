'use server';

import { auth } from '@/auth';
import { apiFetch } from '@/lib/api';

export type ApiKeyRow = {
  id: string;
  ownerEmail: string;
  rateLimit: number;
  prefix: string;
};

export async function listApiKeys(): Promise<{ keys: ApiKeyRow[]; error?: string }> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return { keys: [], error: 'Sign in required' };
  }

  try {
    return await apiFetch<{ keys: ApiKeyRow[] }>('/v1/api-keys', { email });
  } catch (error) {
    return { keys: [], error: error instanceof Error ? error.message : 'Failed to load keys' };
  }
}

export async function createApiKey(formData: FormData): Promise<{
  secret?: string;
  key?: ApiKeyRow & { secret?: string };
  error?: string;
}> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return { error: 'Sign in required' };
  }

  const rateLimitRaw = String(formData.get('rateLimit') ?? '60');
  const rateLimit = Number(rateLimitRaw) || 60;

  try {
    const result = await apiFetch<{
      key: ApiKeyRow & { secret: string };
    }>('/v1/api-keys', {
      method: 'POST',
      email,
      body: JSON.stringify({ rateLimit }),
    });
    return { secret: result.key.secret, key: result.key };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to create key' };
  }
}

export async function revokeApiKey(formData: FormData): Promise<{ error?: string }> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return { error: 'Sign in required' };
  }

  const id = String(formData.get('id') ?? '');
  if (!id) {
    return { error: 'Missing key id' };
  }

  try {
    await apiFetch(`/v1/api-keys/${id}`, { method: 'DELETE', email });
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to revoke key' };
  }
}
