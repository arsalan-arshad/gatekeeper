import { createHash } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { checkAdminToken } from '../admin-auth.js';
import { logAbuse } from '../abuse-log.js';
import { DEMO_BUSY_ERROR, demoJudgeRequest, isBusyFailure } from '../demo-judge.js';
import { getDemoProfile, listDemoProfilesPublic } from '../demo-profiles.js';
import { PROMPT_VERSION } from '../judge.js';
import { createLlm, type Llm } from '../llm.js';
import { clientIp } from '../client-ip.js';
import {
  checkDemoIpRateLimit,
  DEMO_IP_DAILY_LIMIT,
  peekDemoIpRateLimit,
  refundDemoIpRateLimit,
  retryAfterSeconds,
  resetRateLimitersForTests,
} from '../rate-limit.js';
import { MESSAGE_MAX_CHARS } from '../request-limits.js';

export { DEMO_IP_DAILY_LIMIT };

/** Demo verdict cache TTL — 24h. */
export const CACHE_TTL = 24 * 60 * 60 * 1000;

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
  message: z.string().max(MESSAGE_MAX_CHARS),
  senderName: z.string().min(1).max(100).optional(),
  senderContact: z.string().min(1).max(320).optional(),
  /** Landing example chips — judged without consuming the daily IP quota. */
  example: z.boolean().optional(),
});

/** Optional LLM override for unit tests — never used in production. */
let demoLlmOverride: Llm | undefined;

export function setDemoLlmForTests(llm: Llm | undefined): void {
  demoLlmOverride = llm;
}

export function resetDemoRateLimiterForTests(): void {
  resetRateLimitersForTests();
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
    const peek = await peekDemoIpRateLimit(ip);
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

    const rawBody = (request.body ?? {}) as { message?: unknown };
    if (typeof rawBody.message === 'string' && rawBody.message.length > MESSAGE_MAX_CHARS) {
      return reply.status(400).send({ error: 'Keep it under 2,000 characters' });
    }

    const parsed = demoJudgeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Invalid demo request', details: parsed.error.flatten() });
    }

    const message = parsed.data.message?.trim() ?? '';
    if (!message) {
      // Empty / whitespace: 400 and do not consume quota.
      const peek = await peekDemoIpRateLimit(ip);
      return reply.status(400).send({
        error: 'Message is required',
        remaining: peek.remaining,
        limit: DEMO_IP_DAILY_LIMIT,
      });
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
      message,
    });
    const cached = getCachedVerdict(cacheKey);
    if (cached) {
      // Example chips / repeat messages served from cache do not consume quota.
      const peek = await peekDemoIpRateLimit(ip);
      return {
        ...cached,
        remaining: peek.remaining,
        limit: DEMO_IP_DAILY_LIMIT,
        cached: true,
      } satisfies DemoJudgeBody;
    }

    const isExample = parsed.data.example === true;
    let remaining = (await peekDemoIpRateLimit(ip)).remaining;
    let consumedQuota = false;
    if (!isExample) {
      const limit = await checkDemoIpRateLimit(ip);
      if (!limit.ok) {
        await logAbuse({
          kind: 'rate_limit_ip',
          ip,
          detail: `demo_judge reset_ms=${limit.resetMs}`,
          log: request.log,
        });
        reply.header('retry-after', retryAfterSeconds(limit.resetMs));
        return reply.status(429).send({
          error: 'Demo rate limit exceeded — try again tomorrow',
          retry_after_ms: limit.resetMs,
          remaining: 0,
          limit: DEMO_IP_DAILY_LIMIT,
        });
      }
      remaining = limit.remaining;
      consumedQuota = true;
    }

    let result: Awaited<ReturnType<typeof demoJudgeRequest>>;
    try {
      result = await demoJudgeRequest({ ...parsed.data, message }, llm, request.log);
    } catch (error) {
      request.log.error({ err: error }, 'demo judge unexpected failure');
      if (consumedQuota) {
        remaining = (await refundDemoIpRateLimit(ip)).remaining;
      }
      return reply.status(503).send({ error: DEMO_BUSY_ERROR, remaining });
    }

    if ('error' in result) {
      if (isBusyFailure(result)) {
        // LLM/provider failure must not burn demo quota.
        if (consumedQuota) {
          remaining = (await refundDemoIpRateLimit(ip)).remaining;
        }
        return reply.status(503).send({ error: result.error, remaining });
      }
      return reply.status(400).send({ error: result.error, remaining });
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
      remaining,
      limit: DEMO_IP_DAILY_LIMIT,
      cached: false,
    } satisfies DemoJudgeBody;
  });
}
