import { createHash } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { logAbuse } from '../abuse-log.js';
import { DEMO_BUSY_ERROR, demoJudgeRequest, isBusyFailure } from '../demo-judge.js';
import { listDemoProfilesPublic } from '../demo-profiles.js';
import { createLlm, type Llm } from '../llm.js';
import { FixedWindowRateLimiter } from '../rate-limit.js';
import { MESSAGE_MAX_CHARS } from '../request-limits.js';

/** Custom (uncached) demo requests: 20 / IP / UTC day. Cached chip responses do not count. */
export const DEMO_IP_DAILY_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const VERDICT_CACHE_TTL_MS = DAY_MS;

const demoIpLimiter = new FixedWindowRateLimiter(DEMO_IP_DAILY_LIMIT, DAY_MS);

type DemoJudgeBody = {
  handle: string;
  score: number;
  decision: string;
  reason_public: string;
  suggested_rewrite: string | null;
  similarity: number;
  remaining: number;
  limit: number;
  cached: boolean;
};

type CachedVerdict = {
  expiresAt: number;
  body: Omit<DemoJudgeBody, 'remaining' | 'limit' | 'cached'>;
};

const verdictCache = new Map<string, CachedVerdict>();

const demoJudgeSchema = z.object({
  handle: z.string().min(1).max(64),
  message: z.string().min(1).max(MESSAGE_MAX_CHARS),
  senderName: z.string().min(1).max(120).optional(),
  senderContact: z.string().min(1).max(320).optional(),
});

/** Optional LLM override for unit tests — never used in production. */
let demoLlmOverride: Llm | undefined;

export function setDemoLlmForTests(llm: Llm | undefined): void {
  demoLlmOverride = llm;
}

function clientIp(request: { ip: string; headers: Record<string, unknown> }): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || request.ip;
  }
  return request.ip;
}

export function resetDemoRateLimiterForTests(): void {
  demoIpLimiter.clear();
  verdictCache.clear();
}

function resolveDemoLlm(): Llm {
  if (demoLlmOverride) return demoLlmOverride;
  return createLlm({ maxRetries: 0 });
}

function verdictCacheKey(handle: string, message: string): string {
  return createHash('sha256').update(`${handle}\n${message}`).digest('hex');
}

function getCachedVerdict(key: string): CachedVerdict['body'] | null {
  const hit = verdictCache.get(key);
  if (!hit) return null;
  if (Date.now() >= hit.expiresAt) {
    verdictCache.delete(key);
    return null;
  }
  return hit.body;
}

function demoLimitKey(ip: string): string {
  return `demo:${ip || 'unknown'}`;
}

export async function registerDemoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/demo/profiles', async () => ({
    profiles: listDemoProfilesPublic(),
  }));

  app.get('/v1/demo/quota', async (request) => {
    const ip = clientIp(request);
    const peek = demoIpLimiter.peek(demoLimitKey(ip));
    return {
      remaining: peek.remaining,
      limit: DEMO_IP_DAILY_LIMIT,
      reset_ms: peek.resetMs,
    };
  });

  app.post('/v1/demo/judge', async (request, reply) => {
    const ip = clientIp(request);
    const limitKey = demoLimitKey(ip);

    const parsed = demoJudgeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Invalid demo request', details: parsed.error.flatten() });
    }

    const cacheKey = verdictCacheKey(parsed.data.handle, parsed.data.message.trim());
    const cached = getCachedVerdict(cacheKey);
    if (cached) {
      // Example chips / repeat messages served from cache do not consume quota.
      const peek = demoIpLimiter.peek(limitKey);
      return {
        ...cached,
        remaining: peek.remaining,
        limit: DEMO_IP_DAILY_LIMIT,
        cached: true,
      } satisfies DemoJudgeBody;
    }

    const limit = demoIpLimiter.check(limitKey);
    if (!limit.ok) {
      await logAbuse({
        kind: 'rate_limit_ip',
        ip,
        detail: `demo_judge reset_ms=${limit.resetMs}`,
        log: request.log,
      });
      reply.header('retry-after', Math.ceil(limit.resetMs / 1000));
      return reply.status(429).send({
        error: 'Demo rate limit exceeded — try again tomorrow',
        retry_after_ms: limit.resetMs,
        remaining: 0,
        limit: DEMO_IP_DAILY_LIMIT,
      });
    }

    let llm: Llm;
    try {
      llm = resolveDemoLlm();
    } catch (error) {
      request.log.error({ err: error }, 'demo judge LLM init failed');
      return reply.status(503).send({ error: DEMO_BUSY_ERROR, remaining: limit.remaining });
    }

    const result = await demoJudgeRequest(parsed.data, llm, request.log);
    if ('error' in result) {
      if (isBusyFailure(result)) {
        return reply.status(503).send({ error: result.error, remaining: limit.remaining });
      }
      return reply.status(400).send({ error: result.error, remaining: limit.remaining });
    }

    // Never leak reason_private on the public demo endpoint.
    const cachedBody = {
      handle: result.handle,
      score: result.score,
      decision: result.decision,
      reason_public: result.reason_public,
      suggested_rewrite: result.suggested_rewrite,
      similarity: result.similarity,
    };

    verdictCache.set(cacheKey, { expiresAt: Date.now() + VERDICT_CACHE_TTL_MS, body: cachedBody });

    return {
      ...cachedBody,
      remaining: limit.remaining,
      limit: DEMO_IP_DAILY_LIMIT,
      cached: false,
    } satisfies DemoJudgeBody;
  });
}
