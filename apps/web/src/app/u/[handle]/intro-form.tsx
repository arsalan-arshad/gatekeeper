'use client';

import { useMemo, useState, useTransition } from 'react';

import { API_URL } from '@/lib/api-url';

const MESSAGE_MAX = 2000;
const NAME_MAX = 100;

export function IntroRequestForm({ handle }: { handle: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');

  const nameOver = name.trim().length > NAME_MAX;
  const messageOver = message.trim().length > MESSAGE_MAX;
  const canSubmit = useMemo(() => {
    return (
      name.trim().length > 0 && message.trim().length > 0 && !nameOver && !messageOver && !pending
    );
  }, [name, message, nameOver, messageOver, pending]);

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

      if (payload.senderName.length > NAME_MAX || payload.message.length > MESSAGE_MAX) {
        setError('Name or message is too long');
        return;
      }

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
      setStatus(
        'Request received — verdict is on-screen. Check your email to verify your address before Gatekeeper will message you.',
      );
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-3">
      <label className="text-sm">
        Your name
        <input
          required
          name="senderName"
          maxLength={NAME_MAX}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-2 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2"
        />
        <span className="mt-1 block text-xs text-[var(--muted)]">
          {name.trim().length}/{NAME_MAX}
        </span>
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
          maxLength={MESSAGE_MAX}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mt-2 min-h-32 w-full rounded-md border border-white/15 bg-black/30 px-3 py-2"
        />
        <span className="mt-1 block text-xs text-[var(--muted)]">
          {message.trim().length}/{MESSAGE_MAX}
        </span>
      </label>
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {status ? <p className="text-sm text-[var(--accent)]">{status}</p> : null}
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-fit rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-60"
      >
        {pending ? 'Sending…' : 'Submit request'}
      </button>
    </form>
  );
}
