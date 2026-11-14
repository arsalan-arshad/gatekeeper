import { pathToFileURL } from 'node:url';

import Fastify from 'fastify';

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? '0.0.0.0';

export function buildServer() {
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({
    ok: true,
    service: 'gatekeeper-api',
  }));

  return app;
}

async function main() {
  const app = buildServer();
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
