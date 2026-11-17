'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { captureEvent, resetAnalytics } from '@/lib/analytics/client';

import {
  deleteAccount,
  exportData,
  resendIntroContactVerify,
  saveDirectorySettings,
  saveSettings,
} from './actions';

export function SettingsClient({
  initialMode,
  email,
  handle,
  initialIntroContactEmail,
  initialIntroContactVerified,
  initialIntroContactNeedsVerification,
  initialDirectoryOptIn,
  initialDirectoryRole,
  initialDirectoryTags,
}: {
  initialMode: 'instant' | 'daily_digest' | 'off';
  email: string;
  handle: string;
  initialIntroContactEmail: string | null;
  initialIntroContactVerified: boolean;
  initialIntroContactNeedsVerification: boolean;
  initialDirectoryOptIn: boolean;
  initialDirectoryRole: string | null;
  initialDirectoryTags: string[];
}) {
  const [mode, setMode] = useState(initialMode);
  const [introContactEmail, setIntroContactEmail] = useState(initialIntroContactEmail ?? '');
  const [introVerified, setIntroVerified] = useState(initialIntroContactVerified);
  const [introNeedsVerify, setIntroNeedsVerify] = useState(initialIntroContactNeedsVerification);
  const [directoryOptIn, setDirectoryOptIn] = useState(initialDirectoryOptIn);
  const [directoryRole, setDirectoryRole] = useState(initialDirectoryRole ?? '');
  const [directoryTags, setDirectoryTags] = useState(initialDirectoryTags.join(', '));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveSettings({ notificationEmailMode: mode });
      if ('error' in result && result.error) {
        setError(result.error);
        return;
      }
      captureEvent('notification_settings_saved', { notification_mode: mode });
      setMessage('Notification settings saved.');
    });
  }

  function onSaveIntroContact() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const next = introContactEmail.trim() || null;
      const result = await saveSettings({ introContactEmail: next });
      if ('error' in result && result.error) {
        setError(result.error);
        return;
      }
      if ('introContactNeedsVerification' in result && result.introContactNeedsVerification) {
        setIntroNeedsVerify(true);
        setIntroVerified(false);
        setMessage(
          'verificationEmailSent' in result && result.verificationEmailSent
            ? 'Check that inbox for a confirmation link. Intros keep using your login email until confirmed.'
            : 'Saved. Confirmation email could not be sent — try Resend confirmation.',
        );
      } else {
        setIntroNeedsVerify(false);
        setIntroVerified(false);
        setMessage('Intro contact cleared. Intros use your login email.');
      }
    });
  }

  function onResendIntroVerify() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await resendIntroContactVerify();
      if ('error' in result && result.error) {
        setError(result.error);
        return;
      }
      setMessage('Confirmation email resent.');
    });
  }

  function onSaveDirectory() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const tags = directoryTags
        .split(/[,\s]+/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      const result = await saveDirectorySettings({
        optIn: directoryOptIn,
        role: directoryRole.trim() || null,
        tags,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      captureEvent('directory_opt_in', { enabled: directoryOptIn, surface: 'settings' });
      setMessage(directoryOptIn ? 'Listed in the directory.' : 'Removed from the directory.');
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
      captureEvent('data_exported');
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
      <section id="directory">
        <h2 className="text-xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          Directory
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Opt in to appear on{' '}
          <Link href="/explore" className="text-[var(--accent)] hover:brightness-110">
            /explore
          </Link>
          . Every intro still goes through your rules.
        </p>
        <label className="mt-4 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={directoryOptIn}
            onChange={(e) => setDirectoryOptIn(e.target.checked)}
          />
          <span>List me in the Gatekeeper directory</span>
        </label>
        {directoryOptIn ? (
          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-2 text-sm">
              Role
              <input
                className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
                value={directoryRole}
                onChange={(e) => setDirectoryRole(e.target.value)}
                maxLength={80}
                placeholder="e.g. Founder"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              Tags (comma-separated)
              <input
                className="rounded-md border border-white/15 bg-black/30 px-3 py-2"
                value={directoryTags}
                onChange={(e) => setDirectoryTags(e.target.value)}
                placeholder="saas, mobile"
              />
            </label>
            <Link
              href={`/@${handle}?ref=explore`}
              className="text-sm text-[var(--accent)] hover:brightness-110"
            >
              See yourself on /explore →
            </Link>
          </div>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={onSaveDirectory}
          className="mt-4 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#062015] disabled:opacity-50"
        >
          Save directory
        </button>
      </section>

      <section className="border-t border-white/10 pt-6">
        <h2 className="text-xl" style={{ fontFamily: 'var(--font-display), Georgia, serif' }}>
          Intro contact email
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Optional alternate address for connection emails. Must be confirmed via a link we send
          there — until then, intros use your login email ({email}).
        </p>
        <label className="mt-4 block text-sm">
          <span className="text-[var(--muted)]">Contact email</span>
          <input
            type="email"
            value={introContactEmail}
            onChange={(e) => setIntroContactEmail(e.target.value)}
            placeholder={email}
            className="mt-1 w-full rounded-md border border-white/15 bg-black/20 px-3 py-2"
          />
        </label>
        {introVerified ? (
          <p className="mt-2 text-sm text-[var(--accent)]">Confirmed for intros.</p>
        ) : null}
        {introNeedsVerify ? (
          <p className="mt-2 text-sm text-amber-200/90">
            Pending confirmation — check that inbox, or{' '}
            <button
              type="button"
              disabled={pending}
              onClick={onResendIntroVerify}
              className="underline disabled:opacity-50"
            >
              resend confirmation
            </button>
            .
          </p>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={onSaveIntroContact}
          className="mt-4 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#062015] disabled:opacity-50"
        >
          Save intro contact
        </button>
      </section>

      <section className="border-t border-white/10 pt-6">
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
