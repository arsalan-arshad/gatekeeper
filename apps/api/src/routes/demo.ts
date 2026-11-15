import { createHash } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { checkAdminToken } from '../admin-auth.js';
import { logAbuse } from '../abuse-log.js';
import { DEMO_BUSY_ERROR, demoJudgeRequest, isBusyFailure } from '../demo-judge.js';
import { getDemoProfile, listDemoProfilesPublic } from '../demo-profiles.js';
import { PROMPT_VERSION } from '../judge.js';
import { createLlm, type Llm } from '../llm.js';
import { FixedWindowRateLimiter } from '../rate-limit.js';
import { MESSAGE_MAX_CHARS } from '../request-limits.js';

/** Custom (uncached) demo requests: 20 / IP / UTC day. Cached chip responses do not count. */
export const DEMO_IP_DAILY_LIMIT = 20;

/** Demo verdict cache TTL — 24h. */
export const CACHE_TTL = 24 * 60 * 60 * 1000;

const demoIpLimiter = new FixedWindowRateLimiter(DEMO_IP_DAILY_LIMIT, CACHE_TTL);

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
  clearDemoVerdictCache();
}

/** Clear in-memory demo verdict cache (admin / tests / post-deploy). */
export function clearDemoVerdictCache(): number {
  const size = verdictCache.size;
  verdictCache.clear();
  return size;
}

export function demoVerdictCacheSize(): number {
  return verdictCache.size;
}

function resolveDemoLlm(): Llm {
  if (demoLlmOverride) return demoLlmOverride;
  return createLlm({ maxRetries: 0 });
}

/** Collapse whitespace for stable cache keys. */
export function normalizeJudgeMessage(message: string): string {
  return message.trim().replace(/\s+/g, ' ');
}

/**
 * Cache key = hash(PROMPT_VERSION + model + profile rules + normalized message).
 * Bumping PROMPT_VERSION invalidates all prior demo verdicts.
 */
export function verdictCacheKey(input: {
  promptVersion: string;
  model: string;
  ruleText: string;
  message: string;
}): string {
  const normalized = normalizeJudgeMessage(input.message);
  return createHash('sha256')
    .update([input.promptVersion, input.model, input.ruleText, normalized].join('\0'), 'utf8')
    .digest('hex');
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

function requireAdminToken(
  request: {
    query: unknown;
    headers: { authorization?: string | string[] | undefined };
  },
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
): boolean {
  const result = checkAdminToken(request);
  if (result.ok) return true;
  reply.status(result.status).send({ error: result.error });
  return false;
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

  app.post('/admin/cache/clear', async (request, reply) => {
    if (!requireAdminToken(request, reply)) return;
    const cleared = clearDemoVerdictCache();
    return { ok: true, cleared };
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

    const profile = getDemoProfile(parsed.data.handle);
    if (!profile) {
      return reply.status(400).send({ error: 'Unknown demo profile' });
    }

    let llm: Llm;
    try {
      llm = resolveDemoLlm();
    } catch (error) {
      request.log.error({ err: error }, 'demo judge LLM init failed');
      return reply.status(503).send({ error: DEMO_BUSY_ERROR });
    }

    const cacheKey = verdictCacheKey({
      promptVersion: PROMPT_VERSION,
      model: llm.chatModel,
      ruleText: profile.ruleText,
      message: parsed.data.message,
    });
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

    const result = await demoJudgeRequest(parsed.data, llm, request.log);
    if ('error' in result) {
      if (isBusyFailure(result)) {
        return reply.status(503).send({ error: result.error, remaining: limit.remaining });
      }
      return reply.status(400).send({ error: result.error, remaining: limit.remaining });
    }

    // Never leak reason_private on the public demo endpoint.
    const body = {
      handle: result.handle,
      score: result.score,
      decision: result.decision,
      reason_public: result.reason_public,
      suggested_rewrite: result.suggested_rewrite,
      similarity: result.similarity,
    };

    // Only cache successful schema-valid verdicts — never errors or coerce/fallback outputs.
    if (result.schema_valid) {
      verdictCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL, body });
    }

    return {
      ...body,
      remaining: limit.remaining,
      limit: DEMO_IP_DAILY_LIMIT,
      cached: false,
    } satisfies DemoJudgeBody;
  });
}
