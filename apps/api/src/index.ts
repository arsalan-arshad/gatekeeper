import { pathToFileURL } from 'node:url';

import cors from '@fastify/cors';
import Fastify from 'fastify';

import { logAbuse } from './abuse-log.js';
import { buildLlmsTxt } from './llms-txt.js';
import { buildOpenApiDocument } from './openapi.js';
import { FASTIFY_BODY_LIMIT } from './request-limits.js';
import { registerAgentRoutes } from './routes/agent.js';
import { registerDemoRoutes } from './routes/demo.js';
import { registerKeyRoutes } from './routes/keys.js';
import { registerLedgerRoutes } from './routes/ledger.js';
import { registerOnboardingRoutes } from './routes/onboarding.js';
import { registerOptInRoutes } from './routes/opt-in.js';
import { registerPaymentRoutes } from './routes/payments.js';
import { registerPublicRoutes } from './routes/public.js';

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

export async function buildServer() {
  const app = Fastify({
    logger: true,
    bodyLimit: FASTIFY_BODY_LIMIT,
  });

  await app.register(cors, {
    origin: true,
    allowedHeaders: [
      'content-type',
      'x-user-email',
      'x-internal-secret',
      'x-api-key',
      'authorization',
      'x-signature',
    ],
  });

  // Preserve raw JSON for Lemon Squeezy HMAC verification.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    if (Buffer.isBuffer(body) && body.byteLength > FASTIFY_BODY_LIMIT) {
      void logAbuse({
        kind: 'oversized_body',
        ip: request.ip,
        detail: `bytes=${body.byteLength}`,
        log: request.log,
      });
      done(Object.assign(new Error('Request body too large'), { statusCode: 413 }), undefined);
      return;
    }
    const raw = body.toString('utf8');
    (request as { rawBody?: string }).rawBody = raw;
    if (!raw) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(raw));
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (statusCode === 413) {
      void logAbuse({
        kind: 'oversized_body',
        ip: request.ip,
        detail: error.message,
        log: request.log,
      });
      return reply
        .status(413)
        .send({ error: 'Request body too large', max_bytes: FASTIFY_BODY_LIMIT });
    }
    request.log.error(error);
    return reply.status(statusCode).send({
      error: statusCode >= 500 ? 'Internal Server Error' : error.message,
    });
  });

  app.get('/health', async () => ({
    ok: true,
    service: 'gatekeeper-api',
  }));

  const apiBase = (process.env.API_URL ?? `http://localhost:${port}`).replace(/\/$/, '');
  const appBase = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  app.get('/openapi.json', async () => buildOpenApiDocument(apiBase));

  app.get('/llms.txt', async (_request, reply) => {
    reply.type('text/plain; charset=utf-8');
    return buildLlmsTxt({ apiBase, appBase });
  });

  await registerOnboardingRoutes(app);
  await registerPublicRoutes(app);
  await registerDemoRoutes(app);
  await registerOptInRoutes(app);
  await registerAgentRoutes(app);
  await registerKeyRoutes(app);
  await registerLedgerRoutes(app);
  await registerPaymentRoutes(app);

  return app;
}

async function main() {
  const app = await buildServer();
  await app.listen({ port, host });
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
