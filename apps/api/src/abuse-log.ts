import { abuseEvents } from '@gatekeeper/db';
import type { FastifyBaseLogger } from 'fastify';

import { getDb } from './db.js';

export type AbuseKind = 'rate_limit_ip' | 'rate_limit_key' | 'oversized_body' | 'spam_decision';

export type AbuseLogInput = {
  kind: AbuseKind;
  ip?: string | null;
  apiKeyId?: string | null;
  targetUserId?: string | null;
  detail?: string | null;
  log?: FastifyBaseLogger;
};

/**
 * Persist an abuse signal and mirror it to the request logger.
 * Failures are swallowed so protection never blocks the response path.
 */
export async function logAbuse(input: AbuseLogInput): Promise<void> {
  input.log?.warn(
    {
      abuse: true,
      kind: input.kind,
      ip: input.ip ?? undefined,
      apiKeyId: input.apiKeyId ?? undefined,
      targetUserId: input.targetUserId ?? undefined,
      detail: input.detail ?? undefined,
    },
    `abuse:${input.kind}`,
  );

  try {
    const db = getDb();
    await db.insert(abuseEvents).values({
      kind: input.kind,
      ip: input.ip ?? null,
      apiKeyId: input.apiKeyId ?? null,
      targetUserId: input.targetUserId ?? null,
      detail: input.detail ?? null,
    });
  } catch (error) {
    input.log?.error({ err: error }, 'failed to persist abuse event');
  }
}
