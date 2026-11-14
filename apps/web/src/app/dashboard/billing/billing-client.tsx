'use client';

import { useState, useTransition } from 'react';

import { startCheckout, type BillingMe } from './actions';

export function BillingClient({ initial }: { initial: BillingMe }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function checkout(kind: 'pro' | 'credits') {
    setError(null);
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

  const { config, user, creditsCents, enabled } = initial;

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-md border border-white/10 bg-black/20 p-4 text-sm">
        <p>
          Feature flag:{' '}
          <strong className={enabled ? 'text-[var(--accent)]' : 'text-red-300'}>
            PAYMENTS_ENABLED={enabled ? 'true' : 'false'}
          </strong>
        </p>
        <p className="mt-2 text-[var(--muted)]">
          When off, checkouts return 503 and stakes/credits are not enforced. Webhooks acknowledge
          but do not mutate billing state.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="border-b border-white/10 pb-3">
          <p className="text-sm text-[var(--muted)]">Plan</p>
          <p
            className="mt-1 text-2xl"
            style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
          >
            {user.plan}
          </p>
        </div>
        <div className="border-b border-white/10 pb-3">
          <p className="text-sm text-[var(--muted)]">Sender credits</p>
          <p
            className="mt-1 text-2xl"
            style={{ fontFamily: 'var(--font-display), Georgia, serif' }}
          >
            ${(creditsCents / 100).toFixed(2)}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3 text-sm text-[var(--muted)]">
        <p>
          Pro ${config.proPriceUsd}/mo — custom rules + up to {config.proInboxLimit} inboxes (free:{' '}
          {config.freeInboxLimit}).
        </p>
        <p>
          Pay-per-accepted-intro: ${(config.introCreditCents / 100).toFixed(2)} from sender credits.
          Optional ${(config.stakeCents / 100).toFixed(2)} stake — refunded on accept, forfeited to
          the receiver on spam.
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!enabled || pending || user.plan === 'pro'}
          onClick={() => checkout('pro')}
          className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-50"
        >
          {user.plan === 'pro' ? 'Pro active' : 'Upgrade to Pro'}
        </button>
        <button
          type="button"
          disabled={!enabled || pending}
          onClick={() => checkout('credits')}
          className="rounded-md border border-white/20 px-4 py-2 font-medium disabled:opacity-50"
        >
          Buy intro credits
        </button>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
