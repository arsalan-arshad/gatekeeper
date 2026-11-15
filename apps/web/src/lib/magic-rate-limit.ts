import { createDb } from '@gatekeeper/db';
import { sql } from 'drizzle-orm';

import { normalizeEmailForRateLimit } from './email-normalize';

const MAGIC_EMAIL_LIMIT = 3;
const MAGIC_EMAIL_WINDOW_MS = 60 * 60 * 1000;
const MAGIC_IP_LIMIT = 10;
const MAGIC_IP_WINDOW_MS = 60 * 60 * 1000;

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  return createDb(url);
}

/** Thrown / returned when the durable limiter cannot be reached — callers must fail closed. */
export class MagicLinkLimiterUnavailableError extends Error {
  readonly statusCode = 503 as const;
  constructor(cause?: unknown) {
    super('Magic link rate limiter unavailable');
    this.name = 'MagicLinkLimiterUnavailableError';
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

export type MagicLinkGate = { ok: true } | { ok: false; status: 429 | 503 };

/**
 * Atomic fixed-window consume: INSERT … ON CONFLICT DO UPDATE … RETURNING count.
 */
async function consume(key: string, limit: number, windowMs: number): Promise<boolean> {
  const db = getDb();
  const nowMs = Date.now();
  const windowStart = new Date(nowMs);
  const rows = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limit_buckets (bucket_key, window_start, count, updated_at)
    VALUES (${key}, ${windowStart}, 1, ${windowStart})
    ON CONFLICT (bucket_key) DO UPDATE SET
      count = CASE
        WHEN (EXTRACT(EPOCH FROM (${windowStart}::timestamptz - rate_limit_buckets.window_start)) * 1000)
          >= ${windowMs}
        THEN 1
        ELSE rate_limit_buckets.count + 1
      END,
      window_start = CASE
        WHEN (EXTRACT(EPOCH FROM (${windowStart}::timestamptz - rate_limit_buckets.window_start)) * 1000)
          >= ${windowMs}
        THEN ${windowStart}::timestamptz
        ELSE rate_limit_buckets.window_start
      END,
      updated_at = ${windowStart}::timestamptz
    RETURNING count
  `);

  const row = rows[0] as { count: number } | undefined;
  if (!row) {
    throw new Error('rate_limit_buckets upsert returned no row');
  }
  return Number(row.count) <= limit;
}

/** Magic-link: 3/email/hour + 10/IP/hour. Returns false when blocked. Throws on DB errors. */
export async function allowMagicLinkSend(email: string, ip: string): Promise<boolean> {
  const normalized = normalizeEmailForRateLimit(email);
  const emailOk = await consume(
    `magic-email:${normalized}`,
    MAGIC_EMAIL_LIMIT,
    MAGIC_EMAIL_WINDOW_MS,
  );
  if (!emailOk) return false;
  return consume(`magic-ip:${ip || 'unknown'}`, MAGIC_IP_LIMIT, MAGIC_IP_WINDOW_MS);
}

/**
 * Fail-closed gate: limiter/DB errors become status 503 (deny + log), never allow-through.
 */
export async function gateMagicLinkSend(
  email: string,
  ip: string,
  options?: { allow?: typeof allowMagicLinkSend; log?: (err: unknown) => void },
): Promise<MagicLinkGate> {
  const allow = options?.allow ?? allowMagicLinkSend;
  const log =
    options?.log ??
    ((err: unknown) => {
      console.error('[gatekeeper] magic-link rate limiter error (fail closed)', err);
    });
  try {
    const allowed = await allow(email, ip);
    return allowed ? { ok: true } : { ok: false, status: 429 };
  } catch (err) {
    log(err);
    return { ok: false, status: 503 };
  }
}

/** Test helper: clear magic buckets by prefix when DATABASE_URL is set. */
export async function clearMagicRateLimitBucketsForTests(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  await db.execute(sql`DELETE FROM rate_limit_buckets WHERE bucket_key LIKE ${'magic-%'}`);
}
