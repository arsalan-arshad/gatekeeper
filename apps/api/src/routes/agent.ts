import type { FastifyInstance } from 'fastify';

import { logAbuse } from '../abuse-log.js';
import { extractBearerOrApiKey, findApiKeyByRaw } from '../api-keys.js';
import { checkApiKeyRateLimit, checkIpRateLimit } from '../rate-limit.js';
import { introBodySchema, submitIntroRequest } from '../submit-request.js';

function clientIp(request: { ip: string; headers: Record<string, unknown> }): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim() || request.ip;
  }
  return request.ip;
}

export async function registerAgentRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/requests', async (request, reply) => {
    const ip = clientIp(request);
    const ipLimit = checkIpRateLimit(ip);
    if (!ipLimit.ok) {
      await logAbuse({
        kind: 'rate_limit_ip',
        ip,
        detail: `reset_ms=${ipLimit.resetMs}`,
        log: request.log,
      });
      reply.header('retry-after', Math.ceil(ipLimit.resetMs / 1000));
      return reply
        .status(429)
        .send({ error: 'IP rate limit exceeded', retry_after_ms: ipLimit.resetMs });
    }

    const rawKey = extractBearerOrApiKey(
      request.headers as { authorization?: string; 'x-api-key'?: string },
    );
    if (!rawKey) {
      return reply.status(401).send({
        error: 'Missing API key. Use Authorization: Bearer gk_… or X-API-Key.',
      });
    }

    const apiKey = await findApiKeyByRaw(rawKey);
    if (!apiKey) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    const keyLimit = checkApiKeyRateLimit(apiKey.id, apiKey.rateLimit);
    reply.header('x-ratelimit-limit', String(apiKey.rateLimit));
    reply.header('x-ratelimit-remaining', String(keyLimit.remaining));
    if (!keyLimit.ok) {
      await logAbuse({
        kind: 'rate_limit_key',
        ip,
        apiKeyId: apiKey.id,
        detail: `limit_per_hour=${apiKey.rateLimit}`,
        log: request.log,
      });
      reply.header('retry-after', Math.ceil(keyLimit.resetMs / 1000));
      return reply.status(429).send({
        error: 'API key rate limit exceeded',
        limit_per_hour: apiKey.rateLimit,
        retry_after_ms: keyLimit.resetMs,
      });
    }

    const rawBody =
      typeof request.body === 'object' && request.body !== null
        ? (request.body as Record<string, unknown>)
        : {};
    const parsed = introBodySchema.safeParse({ senderType: 'agent', ...rawBody });
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const handle = (parsed.data.targetHandle ?? parsed.data.handle)?.toLowerCase();
    if (!handle) {
      return reply.status(400).send({
        error: 'targetHandle (or handle) is required',
      });
    }

    const outcome = await submitIntroRequest({
      handle,
      body: {
        senderType: parsed.data.senderType,
        senderName: parsed.data.senderName,
        senderContact: parsed.data.senderContact,
        message: parsed.data.message,
      },
      apiKeyId: apiKey.id,
      clientIp: ip,
      log: request.log,
    });

    if (!outcome.ok) {
      return reply.status(outcome.status).send({ error: outcome.error });
    }

    return outcome.result;
  });
}
