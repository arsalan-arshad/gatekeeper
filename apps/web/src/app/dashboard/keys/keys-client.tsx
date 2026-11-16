'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { captureEvent } from '@/lib/analytics/client';

import { createApiKey, revokeApiKey, type ApiKeyRow } from './actions';

export function KeysClient({ initialKeys }: { initialKeys: ApiKeyRow[] }) {
  const router = useRouter();
  const [keys, setKeys] = useState(initialKeys);
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onCreate(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createApiKey(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.secret) {
        setSecret(result.secret);
      }
      if (result.key) {
        setKeys((prev) => [
          {
            id: result.key!.id,
            ownerEmail: result.key!.ownerEmail,
            rateLimit: result.key!.rateLimit,
            prefix: 'gk_',
          },
          ...prev,
        ]);
        captureEvent('api_key_created');
      }
      router.refresh();
    });
  }

  function onRevoke(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const id = String(formData.get('id') ?? '');
      const result = await revokeApiKey(formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      setKeys((prev) => prev.filter((key) => key.id !== id));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <form action={onCreate} className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Rate limit / hour
          <input
            name="rateLimit"
            type="number"
            min={1}
            defaultValue={60}
            className="mt-2 block w-32 rounded-md border border-white/15 bg-black/30 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-[var(--accent)] px-4 py-2 font-medium text-black disabled:opacity-60"
        >
          {pending ? 'Working…' : 'Create API key'}
        </button>
      </form>

      {secret ? (
        <div className="rounded-md border border-[var(--accent)]/40 bg-black/30 p-4 text-sm">
          <p className="font-medium text-[var(--accent)]">
            Copy your key now — it won&apos;t be shown again.
          </p>
          <code className="mt-2 block break-all">{secret}</code>
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <div className="flex flex-col gap-3">
        {keys.length === 0 ? (
          <p className="text-[var(--muted)]">No API keys yet.</p>
        ) : (
          keys.map((key) => (
            <div
              key={key.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 py-3"
            >
              <div className="text-sm">
                <p className="font-medium">
                  {key.prefix}… <span className="text-[var(--muted)]">{key.id.slice(0, 8)}</span>
                </p>
                <p className="text-[var(--muted)]">{key.rateLimit} requests / hour</p>
              </div>
              <form action={onRevoke}>
                <input type="hidden" name="id" value={key.id} />
                <button type="submit" className="text-sm text-red-300 underline" disabled={pending}>
                  Revoke
                </button>
              </form>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
