import { createHash } from 'node:crypto';

/** Normalize message text before hashing for 24h dedupe. */
export function normalizeMessageForDedupe(message: string): string {
  return message.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function messageDedupeHash(message: string): string {
  return createHash('sha256').update(normalizeMessageForDedupe(message), 'utf8').digest('hex');
}

export function normalizeSenderEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Dedupe window: identical (owner, sender, message hash) within 24 hours → 409. */
export const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
