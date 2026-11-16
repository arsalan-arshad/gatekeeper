'use client';

import { useState, useTransition, type FormEvent } from 'react';

import { captureEvent } from '@/lib/analytics/client';

import { joinWaitlist, startCheckout, type BillingMe } from './actions';

export function BillingClient({ initial }: { initial: BillingMe }) {
  const [error, setError] = useState<string | null>(null);
  const [waitlistEmail, setWaitlistEmail] = useState(initial.user.email);
  const [waitlistDone, setWaitlistDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const { config, user, creditsCents } = initial;
  const checkoutAvailable = Boolean(
    config.checkoutAvailable ?? (config.enabled && config.lemonConfigured),
  );

  function checkout(kind: 'pro' | 'credits') {
    setError(null);
    if (kind === 'pro') {
      captureEvent('upgrade_clicked', { surface: 'billing' });
    }
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

  function submitWaitlist(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await joinWaitlist(waitlistEmail);
      if (result.error) {
        setError(result.error);
        return;
      }
      setWaitlistDone(true);
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

      {checkoutAvailable ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending || user.plan === 'pro'}
            onClick={() => checkout('pro')}
            data-testid="upgrade-to-pro"
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
        </div>
      ) : (
        <div className="flex flex-col gap-4" data-testid="billing-waitlist">
          <p className="w-fit rounded-md border border-white/15 px-4 py-2 text-sm text-[var(--muted)]">
            Coming soon
          </p>
          {waitlistDone ? (
            <p className="text-sm text-[var(--accent)]" data-testid="waitlist-success">
              You&apos;re on the Pro waitlist. We&apos;ll email you when checkout opens.
            </p>
          ) : (
            <form onSubmit={submitWaitlist} className="flex max-w-md flex-col gap-3 sm:flex-row">
              <label className="sr-only" htmlFor="waitlist-email">
                Email for Pro waitlist
              </label>
              <input
                id="waitlist-email"
                type="email"
                required
                value={waitlistEmail}
                onChange={(e) => setWaitlistEmail(e.target.value)}
                data-testid="waitlist-email"
                className="flex-1 rounded-md border border-white/15 bg-black/30 px-3 py-2 text-sm text-[var(--fg)]"
                placeholder="you@example.com"
              />
              <button
                type="submit"
                disabled={pending}
                data-testid="join-waitlist"
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[#062015] disabled:opacity-50"
              >
                Join waitlist
              </button>
            </form>
          )}
        </div>
      )}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
