import { createHash, randomBytes } from 'node:crypto';

import { apiKeys } from '@gatekeeper/db';
import { eq } from 'drizzle-orm';

import { getDb } from './db.js';

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/** Generate a Gatekeeper API key: `gk_` + 32 random bytes hex. */
export function generateApiKey(): string {
  return `gk_${randomBytes(24).toString('hex')}`;
}

export async function findApiKeyByRaw(rawKey: string) {
  const hashed = hashApiKey(rawKey);
  const db = getDb();
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.hashedKey, hashed)).limit(1);
  return row ?? null;
}

export function extractBearerOrApiKey(headers: {
  authorization?: string;
  'x-api-key'?: string | string[];
}): string | null {
  const xApiKey = headers['x-api-key'];
  if (typeof xApiKey === 'string' && xApiKey.trim()) {
    return xApiKey.trim();
  }
  const auth = headers.authorization;
  if (auth?.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim();
    return token || null;
  }
  return null;
}
