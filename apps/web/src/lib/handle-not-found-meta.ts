import type { Metadata } from 'next';

/**
 * Metadata for `/handle-not-found` — the soft document middleware re-wraps as
 * a hard 404 for unknown `/@handle` URLs. Must be exactly one robots signal
 * `noindex, nofollow` with no homepage canonical.
 */
export const handleNotFoundMetadata = {
  title: 'Not found · Gatekeeper',
  robots: { index: false, follow: false },
} satisfies Metadata;
