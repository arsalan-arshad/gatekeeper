export type RateLimitResult =
  { ok: true; remaining: number; resetMs: number } | { ok: false; remaining: 0; resetMs: number };

type Bucket = {
  count: number;
  windowStart: number;
};

/**
 * Simple fixed-window rate limiter (in-memory).
 * Suitable for a single API instance on Railway Hobby.
 */
export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Read remaining quota without consuming a unit. */
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

  clear(): void {
    this.buckets.clear();
  }
}

/** Per-IP: 30 requests / minute (abuse protection — agent + general). */
export const ipRateLimiter = new FixedWindowRateLimiter(30, 60_000);

/** Public form: 5 requests / IP / hour. */
export const publicFormIpLimiter = new FixedWindowRateLimiter(5, 60 * 60 * 1000);

/** Public form: 3 requests / sender+owner / day. */
export const publicFormSenderOwnerLimiter = new FixedWindowRateLimiter(3, 24 * 60 * 60 * 1000);

/** Per API key: uses the key's configured hourly limit. */
const keyLimiters = new Map<number, FixedWindowRateLimiter>();

export function checkApiKeyRateLimit(keyId: string, limitPerHour: number): RateLimitResult {
  const limit = Math.max(1, limitPerHour);
  let limiter = keyLimiters.get(limit);
  if (!limiter) {
    limiter = new FixedWindowRateLimiter(limit, 60 * 60 * 1000);
    keyLimiters.set(limit, limiter);
  }
  return limiter.check(`key:${keyId}`);
}

export function checkIpRateLimit(ip: string): RateLimitResult {
  return ipRateLimiter.check(`ip:${ip || 'unknown'}`);
}

export function checkPublicFormIpRateLimit(ip: string): RateLimitResult {
  return publicFormIpLimiter.check(`public-ip:${ip || 'unknown'}`);
}

export function checkPublicFormSenderOwnerRateLimit(
  senderEmail: string,
  ownerUserId: string,
): RateLimitResult {
  const sender = senderEmail.trim().toLowerCase();
  return publicFormSenderOwnerLimiter.check(`public-sender:${ownerUserId}:${sender}`);
}

export function resetRateLimitersForTests(): void {
  ipRateLimiter.clear();
  publicFormIpLimiter.clear();
  publicFormSenderOwnerLimiter.clear();
  keyLimiters.clear();
}
