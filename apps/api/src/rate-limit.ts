import { rateLimitBuckets } from '@gatekeeper/db';
import { eq, sql } from 'drizzle-orm';

import { getDb } from './db.js';
import { normalizeEmailForRateLimit } from './email-normalize.js';

export type RateLimitResult =
  { ok: true; remaining: number; resetMs: number } | { ok: false; remaining: 0; resetMs: number };

type Bucket = {
  count: number;
  windowStart: number;
};

/**
 * In-memory fixed-window limiter (tests / fallback when DB unavailable).
 */
export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  peek(key: string): RateLimitResult {
    const now = this.now();
    const existing = this.buckets.get(key);

    if (!existing || now - existing.windowStart >= this.windowMs) {
      return { ok: true, remaining: this.limit, resetMs: this.windowMs };
    }

    const resetMs = this.windowMs - (now - existing.windowStart);
    if (existing.count >= this.limit) {
      return { ok: false, remaining: 0, resetMs };
    }

    return {
      ok: true,
      remaining: Math.max(0, this.limit - existing.count),
      resetMs,
    };
  }

  check(key: string): RateLimitResult {
    const now = this.now();
    const existing = this.buckets.get(key);

    if (!existing || now - existing.windowStart >= this.windowMs) {
      this.buckets.set(key, { count: 1, windowStart: now });
      return { ok: true, remaining: Math.max(0, this.limit - 1), resetMs: this.windowMs };
    }

    if (existing.count >= this.limit) {
      const resetMs = this.windowMs - (now - existing.windowStart);
      return { ok: false, remaining: 0, resetMs };
    }

    existing.count += 1;
    return {
      ok: true,
      remaining: Math.max(0, this.limit - existing.count),
      resetMs: this.windowMs - (now - existing.windowStart),
    };
  }

  /** Undo one successful consume in the current window (no-op if empty/expired). */
  refund(key: string): RateLimitResult {
    const now = this.now();
    const existing = this.buckets.get(key);
    if (!existing || now - existing.windowStart >= this.windowMs) {
      return { ok: true, remaining: this.limit, resetMs: this.windowMs };
    }
    if (existing.count > 0) existing.count -= 1;
    return {
      ok: true,
      remaining: Math.max(0, this.limit - existing.count),
      resetMs: this.windowMs - (now - existing.windowStart),
    };
  }

  clear(): void {
    this.buckets.clear();
  }
}

/** Force in-memory limiters (unit tests). Production uses Postgres. */
let forceMemory = false;
const memoryLimiters = new Map<string, FixedWindowRateLimiter>();

export function useMemoryRateLimitersForTests(enabled = true): void {
  forceMemory = enabled;
  memoryLimiters.clear();
}

function memoryLimiter(limit: number, windowMs: number): FixedWindowRateLimiter {
  const id = `${limit}:${windowMs}`;
  let limiter = memoryLimiters.get(id);
  if (!limiter) {
    limiter = new FixedWindowRateLimiter(limit, windowMs);
    memoryLimiters.set(id, limiter);
  }
  return limiter;
}

/** Map a consumed counter to ok/remaining (count is post-increment). */
export function rateLimitResultFromCount(
  count: number,
  limit: number,
  windowStartMs: number,
  nowMs: number,
  windowMs: number,
): RateLimitResult {
  const elapsed = Math.max(0, nowMs - windowStartMs);
  const resetMs = Math.max(1, windowMs - elapsed);
  if (count > limit) {
    return { ok: false, remaining: 0, resetMs };
  }
  return {
    ok: true,
    remaining: Math.max(0, limit - count),
    resetMs,
  };
}

/**
 * Durable fixed-window consume against Postgres `rate_limit_buckets`.
 * Single atomic INSERT … ON CONFLICT DO UPDATE … RETURNING (no read-then-write).
 */
export async function consumePostgresRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  nowMs: number = Date.now(),
): Promise<RateLimitResult> {
  if (forceMemory || !process.env.DATABASE_URL) {
    return memoryLimiter(limit, windowMs).check(key);
  }

  const db = getDb();
  const windowStart = new Date(nowMs);
  // postgres.js sql`` params must be strings/numbers — never Date instances.
  const windowStartIso = windowStart.toISOString();
  const expiredBeforeMs = nowMs - windowMs;
  // Single round-trip upsert + RETURNING (no SELECT then UPDATE).
  const [row] = await db
    .insert(rateLimitBuckets)
    .values({
      bucketKey: key,
      windowStart,
      count: 1,
      updatedAt: windowStart,
    })
    .onConflictDoUpdate({
      target: rateLimitBuckets.bucketKey,
      set: {
        count: sql`CASE
          WHEN (EXTRACT(EPOCH FROM ${rateLimitBuckets.windowStart}) * 1000) <= ${expiredBeforeMs}
          THEN 1
          ELSE ${rateLimitBuckets.count} + 1
        END`,
        windowStart: sql`CASE
          WHEN (EXTRACT(EPOCH FROM ${rateLimitBuckets.windowStart}) * 1000) <= ${expiredBeforeMs}
          THEN ${windowStartIso}::timestamptz
          ELSE ${rateLimitBuckets.windowStart}
        END`,
        updatedAt: windowStart,
      },
    })
    .returning({
      count: rateLimitBuckets.count,
      windowStart: rateLimitBuckets.windowStart,
    });

  if (!row) {
    throw new Error('rate_limit_buckets upsert returned no row');
  }

  return rateLimitResultFromCount(row.count, limit, row.windowStart.getTime(), nowMs, windowMs);
}

export async function peekPostgresRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  nowMs: number = Date.now(),
): Promise<RateLimitResult> {
  if (forceMemory || !process.env.DATABASE_URL) {
    return memoryLimiter(limit, windowMs).peek(key);
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(rateLimitBuckets)
    .where(eq(rateLimitBuckets.bucketKey, key))
    .limit(1);

  if (!existing || nowMs - existing.windowStart.getTime() >= windowMs) {
    return { ok: true, remaining: limit, resetMs: windowMs };
  }

  const resetMs = windowMs - (nowMs - existing.windowStart.getTime());
  if (existing.count >= limit) {
    return { ok: false, remaining: 0, resetMs };
  }
  return {
    ok: true,
    remaining: Math.max(0, limit - existing.count),
    resetMs,
  };
}

/** Per-IP: 30 requests / minute (abuse protection — agent + general). */
export const IP_LIMIT = 30;
export const IP_WINDOW_MS = 60_000;

/** Public form: 5 requests / IP / hour. */
export const PUBLIC_FORM_IP_LIMIT = 5;
export const PUBLIC_FORM_IP_WINDOW_MS = 60 * 60 * 1000;

/** Public form: 3 requests / sender+owner / day. */
export const PUBLIC_FORM_SENDER_LIMIT = 3;
export const PUBLIC_FORM_SENDER_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Demo: 20 / IP / day — see demo routes. */
export const DEMO_IP_DAILY_LIMIT = 20;
export const DEMO_IP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Magic link: 3 / email / hour + 10 / IP / hour. */
export const MAGIC_EMAIL_LIMIT = 3;
export const MAGIC_EMAIL_WINDOW_MS = 60 * 60 * 1000;
export const MAGIC_IP_LIMIT = 10;
export const MAGIC_IP_WINDOW_MS = 60 * 60 * 1000;

/** Sender verification emails: 1 / address / day + 20 / IP / day. */
export const SENDER_VERIFY_EMAIL_LIMIT = 1;
export const SENDER_VERIFY_IP_LIMIT = 20;
/** Global sender-verification emails across all owners per rolling day. */
export const SENDER_VERIFY_GLOBAL_LIMIT = 200;
export const SENDER_VERIFY_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function checkIpRateLimit(ip: string): Promise<RateLimitResult> {
  return consumePostgresRateLimit(`ip:${ip || 'unknown'}`, IP_LIMIT, IP_WINDOW_MS);
}

export async function checkPublicFormIpRateLimit(ip: string): Promise<RateLimitResult> {
  return consumePostgresRateLimit(
    `public-ip:${ip || 'unknown'}`,
    PUBLIC_FORM_IP_LIMIT,
    PUBLIC_FORM_IP_WINDOW_MS,
  );
}

export async function checkPublicFormSenderOwnerRateLimit(
  senderEmail: string,
  ownerUserId: string,
): Promise<RateLimitResult> {
  const sender = normalizeEmailForRateLimit(senderEmail);
  return consumePostgresRateLimit(
    `public-sender:${ownerUserId}:${sender}`,
    PUBLIC_FORM_SENDER_LIMIT,
    PUBLIC_FORM_SENDER_WINDOW_MS,
  );
}

export async function checkApiKeyRateLimit(
  keyId: string,
  limitPerHour: number,
): Promise<RateLimitResult> {
  const limit = Math.max(1, limitPerHour);
  return consumePostgresRateLimit(`key:${keyId}`, limit, 60 * 60 * 1000);
}

export async function checkDemoIpRateLimit(ip: string): Promise<RateLimitResult> {
  return consumePostgresRateLimit(
    `demo:${ip || 'unknown'}`,
    DEMO_IP_DAILY_LIMIT,
    DEMO_IP_WINDOW_MS,
  );
}

export async function peekDemoIpRateLimit(ip: string): Promise<RateLimitResult> {
  return peekPostgresRateLimit(`demo:${ip || 'unknown'}`, DEMO_IP_DAILY_LIMIT, DEMO_IP_WINDOW_MS);
}

/**
 * Refund one demo IP consume (LLM busy / 5xx / timeout). Never drops below 0.
 */
export async function refundDemoIpRateLimit(ip: string): Promise<RateLimitResult> {
  return refundPostgresRateLimit(`demo:${ip || 'unknown'}`, DEMO_IP_DAILY_LIMIT, DEMO_IP_WINDOW_MS);
}

export async function refundPostgresRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  nowMs: number = Date.now(),
): Promise<RateLimitResult> {
  if (forceMemory || !process.env.DATABASE_URL) {
    return memoryLimiter(limit, windowMs).refund(key);
  }

  const db = getDb();
  const expiredBeforeMs = nowMs - windowMs;
  const [row] = await db
    .update(rateLimitBuckets)
    .set({
      count: sql`CASE
        WHEN (EXTRACT(EPOCH FROM ${rateLimitBuckets.windowStart}) * 1000) <= ${expiredBeforeMs}
        THEN 0
        WHEN ${rateLimitBuckets.count} > 0
        THEN ${rateLimitBuckets.count} - 1
        ELSE 0
      END`,
      updatedAt: new Date(nowMs),
    })
    .where(eq(rateLimitBuckets.bucketKey, key))
    .returning({
      count: rateLimitBuckets.count,
      windowStart: rateLimitBuckets.windowStart,
    });

  if (!row || nowMs - row.windowStart.getTime() >= windowMs) {
    return { ok: true, remaining: limit, resetMs: windowMs };
  }

  return rateLimitResultFromCount(row.count, limit, row.windowStart.getTime(), nowMs, windowMs);
}

export async function checkMagicEmailRateLimit(email: string): Promise<RateLimitResult> {
  return consumePostgresRateLimit(
    `magic-email:${normalizeEmailForRateLimit(email)}`,
    MAGIC_EMAIL_LIMIT,
    MAGIC_EMAIL_WINDOW_MS,
  );
}

export async function checkMagicIpRateLimit(ip: string): Promise<RateLimitResult> {
  return consumePostgresRateLimit(
    `magic-ip:${ip || 'unknown'}`,
    MAGIC_IP_LIMIT,
    MAGIC_IP_WINDOW_MS,
  );
}

export async function checkSenderVerifyEmailRateLimit(email: string): Promise<RateLimitResult> {
  return consumePostgresRateLimit(
    `sender-verify-email:${normalizeEmailForRateLimit(email)}`,
    SENDER_VERIFY_EMAIL_LIMIT,
    SENDER_VERIFY_WINDOW_MS,
  );
}

/** Max 1 verification email per (owner, address) per 24h. */
export async function checkSenderVerifyOwnerEmailRateLimit(
  ownerId: string,
  email: string,
): Promise<RateLimitResult> {
  return consumePostgresRateLimit(
    `sender-verify-owner-email:${ownerId}:${normalizeEmailForRateLimit(email)}`,
    SENDER_VERIFY_EMAIL_LIMIT,
    SENDER_VERIFY_WINDOW_MS,
  );
}

export async function checkSenderVerifyIpRateLimit(ip: string): Promise<RateLimitResult> {
  return consumePostgresRateLimit(
    `sender-verify-ip:${ip || 'unknown'}`,
    SENDER_VERIFY_IP_LIMIT,
    SENDER_VERIFY_WINDOW_MS,
  );
}

export async function checkSenderVerifyGlobalRateLimit(): Promise<RateLimitResult> {
  return consumePostgresRateLimit(
    'sender-verify-global',
    SENDER_VERIFY_GLOBAL_LIMIT,
    SENDER_VERIFY_WINDOW_MS,
  );
}

export function retryAfterSeconds(resetMs: number): number {
  return Math.max(1, Math.ceil(resetMs / 1000));
}

export function resetRateLimitersForTests(): void {
  useMemoryRateLimitersForTests(true);
  memoryLimiters.clear();
}

/** Clear durable buckets for a key prefix (integration tests). */
export async function clearPostgresRateLimitKeys(prefix: string): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  await db.execute(sql`DELETE FROM rate_limit_buckets WHERE bucket_key LIKE ${prefix + '%'}`);
}
