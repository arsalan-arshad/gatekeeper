import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { logAbuse } from '../abuse-log.js';
import { demoJudgeRequest } from '../demo-judge.js';
import { listDemoProfilesPublic } from '../demo-profiles.js';
import { FixedWindowRateLimiter } from '../rate-limit.js';
import { MESSAGE_MAX_CHARS } from '../request-limits.js';

/** Tighter than general IP limit — landing demo is anonymous and free. */
const demoIpLimiter = new FixedWindowRateLimiter(12, 60_000);

const demoJudgeSchema = z.object({
  handle: z.string().min(1).max(64),
  message: z.string().min(1).max(MESSAGE_MAX_CHARS),
  senderName: z.string().min(1).max(120).optional(),
});

function clientIp(request: { ip: string; headers: Record<string, unknown> }): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || request.ip;
  }
  return request.ip;
}

export function resetDemoRateLimiterForTests(): void {
  demoIpLimiter.clear();
}

export async function registerDemoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/demo/profiles', async () => ({
    profiles: listDemoProfilesPublic(),
  }));

  app.post('/v1/demo/judge', async (request, reply) => {
    const ip = clientIp(request);
    const limit = demoIpLimiter.check(`demo:${ip || 'unknown'}`);
    if (!limit.ok) {
      await logAbuse({
        kind: 'rate_limit_ip',
        ip,
        detail: `demo_judge reset_ms=${limit.resetMs}`,
        log: request.log,
      });
      reply.header('retry-after', Math.ceil(limit.resetMs / 1000));
      return reply
        .status(429)
        .send({ error: 'Demo rate limit exceeded — try again shortly', retry_after_ms: limit.resetMs });
    }

    const parsed = demoJudgeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'Invalid demo request', details: parsed.error.flatten() });
    }

    const result = demoJudgeRequest(parsed.data);
    if ('error' in result) {
      return reply.status(400).send({ error: result.error });
    }

    // Never leak reason_private on the public demo endpoint.
    return {
      handle: parsed.data.handle.replace(/^@/, '').toLowerCase(),
      score: result.score,
      decision: result.decision,
      reason_public: result.reason_public,
      suggested_rewrite: result.suggested_rewrite,
      similarity: result.similarity,
    };
  });
}
