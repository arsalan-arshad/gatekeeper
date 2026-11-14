import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildServer } from './index.ts';

test('GET /openapi.json describes POST /v1/requests', async () => {
  const app = await buildServer();
  app.log.level = 'silent';

  const response = await app.inject({ method: 'GET', url: '/openapi.json' });
  assert.equal(response.statusCode, 200);
  const body = response.json() as {
    paths: Record<string, unknown>;
  };
  assert.ok(body.paths['/v1/requests']);

  await app.close();
});

test('GET /llms.txt explains agent auth and fields', async () => {
  const app = await buildServer();
  app.log.level = 'silent';

  const response = await app.inject({ method: 'GET', url: '/llms.txt' });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'] ?? '', /text\/plain/);
  assert.match(response.body, /X-API-Key/);
  assert.match(response.body, /targetHandle/);
  assert.match(response.body, /reason_public/);

  await app.close();
});

test('POST /v1/requests without API key is 401', async () => {
  const app = await buildServer();
  app.log.level = 'silent';

  const response = await app.inject({
    method: 'POST',
    url: '/v1/requests',
    payload: {
      targetHandle: 'ada',
      senderName: 'Bot',
      senderContact: 'bot@example.com',
      message: 'Hello',
    },
  });

  assert.equal(response.statusCode, 401);
  await app.close();
});
