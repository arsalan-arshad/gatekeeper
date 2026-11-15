'use client';

import { useState, useTransition } from 'react';

import { API_URL } from '@/lib/api-url';

export function IntroRequestForm({ handle }: { handle: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    setStatus(null);
    startTransition(async () => {
      const payload = {
        senderType: 'human' as const,
        senderName: String(formData.get('senderName') ?? '').trim(),
        senderContact: String(formData.get('senderContact') ?? '').trim(),
        message: String(formData.get('message') ?? '').trim(),
      };

      const response = await fetch(`${API_URL}/v1/users/${encodeURIComponent(handle)}/requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(body.error || 'Could not send request');
        return;
      }
      setStatus('Request received. Gatekeeper will review it before any intro is delivered.');
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-3">
      <label className="text-sm">
        Your name
        <input
          required
          name="senderName"
          className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2"
        />
      </label>
      <label className="text-sm">
        Contact email
        <input
          required
          type="email"
          name="senderContact"
          className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2"
        />
      </label>
      <label className="text-sm">
        Why the intro?
        <textarea
          required
          name="message"
          className="mt-2 min-h-32 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2"
        />
      </label>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {status ? <p className="text-sm text-[var(--accent)]">{status}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Submit request'}
      </button>
    </form>
  );
}
