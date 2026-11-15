import { pathToFileURL } from 'node:url';

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import Fastify from 'fastify';

import { checkAdminToken } from './admin-auth.js';
import { logAbuse } from './abuse-log.js';
import { requireInternalAuth } from './internal-auth.js';
import { buildLlmsTxt } from './llms-txt.js';
import { createLlm } from './llm.js';
import { buildOpenApiDocument } from './openapi.js';
import { FASTIFY_BODY_LIMIT } from './request-limits.js';
import { assertEmailLinkSecretConfigured } from './tokens.js';
import { registerAgentRoutes } from './routes/agent.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerDemoRoutes } from './routes/demo.js';
import { registerKeyRoutes } from './routes/keys.js';
import { registerLedgerRoutes } from './routes/ledger.js';
import { registerOnboardingRoutes } from './routes/onboarding.js';
import { registerOptInRoutes } from './routes/opt-in.js';
import { registerPaymentRoutes } from './routes/payments.js';
import { registerPublicRoutes } from './routes/public.js';

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

/**
 * Browser CORS allowlist. Never reflect arbitrary Origin.
 * Always includes production web. Also includes APP_URL origin when set so
 * local/e2e (http://127.0.0.1:3000) and staging can call public form endpoints.
 * Server→API (no Origin) is unaffected. Ambiguity note: user asked for
 * production-only; APP_URL is required for browser public posts in non-prod.
 */
function corsAllowlist(): Set<string> {
  const allowed = new Set<string>(['https://gatekeeper.arsalandev.studio']);
  const appUrl = process.env.APP_URL?.trim();
  if (appUrl) {
    try {
      allowed.add(new URL(appUrl).origin);
    } catch {
      /* ignore invalid APP_URL */
    }
  }
  return allowed;
}

export async function buildServer() {
  const app = Fastify({
    logger: true,
    bodyLimit: FASTIFY_BODY_LIMIT,
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      // Non-browser / same-origin server calls send no Origin — allow.
      if (!origin) {
        cb(null, true);
        return;
      }
      cb(null, corsAllowlist().has(origin));
    },
    allowedHeaders: ['content-type', 'x-api-key', 'authorization', 'x-signature'],
  });

  await app.register(helmet, {
    global: true,
    // API serves JSON; keep CSP basic and frame denial strict.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
    noSniff: true,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    hidePoweredBy: true,
  });

  app.addHook('preHandler', requireInternalAuth);

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

  app.get('/health/llm', async (request, reply) => {
    const auth = checkAdminToken(request);
    if (!auth.ok) {
      return reply.status(auth.status).send({
        error: auth.error,
        ...(auth.status === 503 ? { providers: [] } : {}),
      });
    }

    try {
      const llm = createLlm({ maxRetries: 0, timeoutMs: 8_000 });
      const providers = await llm.healthCheck();
      return { providers };
    } catch (error) {
      request.log.error({ err: error }, 'health/llm probe failed');
      return reply.status(503).send({
        error: error instanceof Error ? error.message : 'LLM health check failed',
        providers: [],
      });
    }
  });

  const apiBase = (process.env.API_URL ?? `http://localhost:${port}`).replace(/\/$/, '');
  const appBase = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  app.get('/openapi.json', async () => buildOpenApiDocument(apiBase));

  app.get('/llms.txt', async (_request, reply) => {
    reply.type('text/plain; charset=utf-8');
    return buildLlmsTxt({ apiBase, appBase });
  });

  await registerOnboardingRoutes(app);
  await registerDashboardRoutes(app);
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
  assertEmailLinkSecretConfigured();
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
