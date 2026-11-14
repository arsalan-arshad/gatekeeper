import { pathToFileURL } from 'node:url';

import cors from '@fastify/cors';
import Fastify from 'fastify';

import { registerOnboardingRoutes } from './routes/onboarding.js';
import { registerPublicRoutes } from './routes/public.js';

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
    allowedHeaders: ['content-type', 'x-user-email', 'x-internal-secret'],
  });

  app.get('/health', async () => ({
    ok: true,
    service: 'gatekeeper-api',
  }));

  await registerOnboardingRoutes(app);
  await registerPublicRoutes(app);

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
