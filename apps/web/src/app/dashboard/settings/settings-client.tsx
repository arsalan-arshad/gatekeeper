'use client';

import { useState, useTransition } from 'react';

import { resetAnalytics } from '@/lib/analytics/client';

import { deleteAccount, exportData, saveSettings } from './actions';

export function SettingsClient({
  initialMode,
  email,
}: {
  initialMode: 'instant' | 'daily_digest' | 'off';
  email: string;
}) {
  const [mode, setMode] = useState(initialMode);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveSettings(mode);
      if (result.error) {
        setError(result.error);
        return;
      }
      setMessage('Notification settings saved.');
    });
  }

  function onExport() {
    setError(null);
    startTransition(async () => {
      const result = await exportData();
      if (result.error) {
        setError(result.error);
        return;
      }
      const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gatekeeper-export.json';
      a.click();
      URL.revokeObjectURL(url);
      setMessage('Export downloaded.');
    });
  }

  function onDelete() {
    if (
      !window.confirm('Delete your Gatekeeper account and all inbox data? This cannot be undone.')
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      resetAnalytics();
      const result = await deleteAccount();
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          Email notifications
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Sent to {email} when intro requests arrive. Digest batches overnight (server cron when
          configured).
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {(
            [
              ['instant', 'Instant'],
              ['daily_digest', 'Daily digest'],
              ['off', 'Off'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="notificationEmailMode"
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {label}
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={onSave}
          className="mt-4 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#062015] disabled:opacity-50"
        >
          Save
        </button>
      </section>

      <section className="border-t border-white/10 pt-6">
        <h2 className="text-xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          Export data
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Download your profile, rules, and inbox as JSON.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={onExport}
          className="mt-4 rounded-md border border-white/15 px-4 py-2 text-sm disabled:opacity-50"
        >
          Export JSON
        </button>
      </section>

      <section className="border-t border-white/10 pt-6">
        <h2 className="text-xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          Delete account
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Permanently removes your Gatekeeper profile, rules, and requests.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={onDelete}
          className="mt-4 rounded-md border border-red-400/40 px-4 py-2 text-sm text-red-200 disabled:opacity-50"
        >
          Delete account
        </button>
      </section>

      {message ? <p className="text-sm text-[var(--accent)]">{message}</p> : null}
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
