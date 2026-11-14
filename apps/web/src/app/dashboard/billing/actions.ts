'use server';

import { auth } from '@/auth';
import { apiFetch } from '@/lib/api';

export type BillingMe = {
  enabled: boolean;
  config: {
    enabled: boolean;
    proPriceUsd: number;
    stakeCents: number;
    introCreditCents: number;
    freeInboxLimit: number;
    proInboxLimit: number;
  };
  user: { email: string; plan: 'free' | 'pro'; lemonSubscriptionId: string | null };
  creditsCents: number;
};

export async function loadBilling(): Promise<{ data?: BillingMe; error?: string }> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { error: 'Sign in required' };

  try {
    const data = await apiFetch<BillingMe>('/v1/payments/me', { email });
    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to load billing' };
  }
}

export async function startCheckout(
  kind: 'pro' | 'credits',
): Promise<{ url?: string; error?: string }> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { error: 'Sign in required' };

  try {
    const result = await apiFetch<{ checkout: { url: string } }>('/v1/payments/checkout', {
      method: 'POST',
      email,
      body: JSON.stringify({ kind }),
    });
    return { url: result.checkout.url };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Checkout failed' };
  }
}
