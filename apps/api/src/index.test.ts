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
