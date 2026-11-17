'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { captureEvent } from '@/lib/analytics/client';

import { saveDirectorySettings } from './settings/actions';

export function DirectoryBanner() {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (hidden) return null;

  function dismiss() {
    setError(null);
    startTransition(async () => {
      const result = await saveDirectorySettings({ optIn: false, dismissPrompt: true });
      if (result.error) {
        setError(result.error);
        return;
      }
      setHidden(true);
      router.refresh();
    });
  }

  function listMe() {
    setError(null);
    startTransition(async () => {
      const result = await saveDirectorySettings({ optIn: true });
      if (result.error) {
        setError(result.error);
        return;
      }
      captureEvent('directory_opt_in', { enabled: true, surface: 'banner' });
      setHidden(true);
      router.push('/dashboard/settings#directory');
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-4">
      <p className="text-sm font-medium text-[var(--fg)]">
        Get found: list yourself in the Gatekeeper directory
      </p>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Appear on <Link href="/explore">/explore</Link>. Intros still go through your rules.
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={listMe}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[#062015] disabled:opacity-50"
        >
          List me
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={dismiss}
          className="rounded-md border border-white/15 px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Not now
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
