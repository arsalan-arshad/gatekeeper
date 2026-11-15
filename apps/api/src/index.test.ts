import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildServer } from './index.ts';

test('GET /health returns ok', async () => {
  const app = await buildServer();
  app.log.level = 'silent';

  const response = await app.inject({
    method: 'GET',
    url: '/health',
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    service: 'gatekeeper-api',
  });

  await app.close();
});

test('GET /health/llm requires ADMIN_TOKEN', async () => {
  const previous = process.env.ADMIN_TOKEN;
  delete process.env.ADMIN_TOKEN;

  const app = await buildServer();
  app.log.level = 'silent';

  const missing = await app.inject({ method: 'GET', url: '/health/llm' });
  assert.equal(missing.statusCode, 503);

  process.env.ADMIN_TOKEN = 'test-admin-token';
  const unauthorized = await app.inject({
    method: 'GET',
    url: '/health/llm?token=wrong',
  });
  assert.equal(unauthorized.statusCode, 401);

  const viaBearer = await app.inject({
    method: 'GET',
    url: '/health/llm',
    headers: { authorization: 'Bearer test-admin-token' },
  });
  // Auth passes; may be 200 or 503 depending on LLM keys in the test env.
  assert.ok([200, 503].includes(viaBearer.statusCode));
  if (viaBearer.statusCode === 401) {
    assert.fail('Bearer ADMIN_TOKEN should authorize /health/llm');
  }

  if (previous === undefined) {
    delete process.env.ADMIN_TOKEN;
  } else {
    process.env.ADMIN_TOKEN = previous;
  }

  await app.close();
});

test('GET /v1/onboarding/questions returns five prompts', async () => {
  const app = await buildServer();
  app.log.level = 'silent';

  const response = await app.inject({
    method: 'GET',
    url: '/v1/onboarding/questions',
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as { questions: Array<{ id: string; prompt: string }> };
  assert.equal(body.questions.length, 5);
  assert.equal(body.questions[0]?.id, 'who');

  await app.close();
});
