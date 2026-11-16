'use client';

import { useState } from 'react';

import { captureEvent } from '@/lib/analytics/client';

export function CopyHandleLink({ handle }: { handle: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    const url = `${window.location.origin}/@${handle}`;
    try {
      await navigator.clipboard.writeText(url);
      captureEvent('handle_link_copied');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onCopy()}
      className="text-sm text-[var(--muted)] hover:text-[var(--fg)]"
      data-testid="copy-handle-link"
    >
      {copied ? 'Copied' : 'Copy link'}
    </button>
  );
}
