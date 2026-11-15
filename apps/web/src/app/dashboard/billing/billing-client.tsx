'use client';

import { useState, useTransition } from 'react';

import { startCheckout, type BillingMe } from './actions';

export function BillingClient({ initial }: { initial: BillingMe }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const { config, user, creditsCents } = initial;
  const checkoutAvailable = Boolean(
    config.checkoutAvailable ?? (config.enabled && config.lemonConfigured),
  );

  function checkout(kind: 'pro' | 'credits') {
    setError(null);
    if (!checkoutAvailable) {
      setError('Coming soon');
      return;
    }
    startTransition(async () => {
      const result = await startCheckout(kind);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.url) {
        window.location.href = result.url;
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="border border-white/10 bg-black/20 p-4">
          <p className="text-sm text-[var(--muted)]">Free</p>
          <p
            className="mt-1 text-2xl"
            style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
          >
            $0
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Receiver inbox, public page, ledger. Up to {config.freeInboxLimit} inbox.
          </p>
          {user.plan === 'free' ? (
            <p className="mt-3 text-sm text-[var(--accent)]">Current plan</p>
          ) : null}
        </div>
        <div className="border border-[var(--accent)]/35 bg-[var(--accent)]/5 p-4">
          <p className="text-sm text-[var(--muted)]">Pro</p>
          <p
            className="mt-1 text-2xl"
            style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
          >
            ${config.proPriceUsd}/mo
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Custom rules + up to {config.proInboxLimit} inboxes. Checkout via Lemon Squeezy.
          </p>
          {user.plan === 'pro' ? (
            <p className="mt-3 text-sm text-[var(--accent)]">Current plan</p>
          ) : null}
        </div>
      </section>

      <section className="border-b border-white/10 pb-3 text-sm text-[var(--muted)]">
        Sender credits: ${(creditsCents / 100).toFixed(2)}
      </section>

      <div className="flex flex-wrap gap-3">
        {checkoutAvailable ? (
          <>
            <button
              type="button"
              disabled={pending || user.plan === 'pro'}
              onClick={() => checkout('pro')}
              className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-50"
            >
              {user.plan === 'pro' ? 'Pro active' : 'Upgrade to Pro'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => checkout('credits')}
              className="rounded-md border border-white/20 px-4 py-2 font-medium disabled:opacity-50"
            >
              Buy intro credits
            </button>
          </>
        ) : (
          <p className="rounded-md border border-white/15 px-4 py-2 text-sm text-[var(--muted)]">
            Coming soon
          </p>
        )}
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
