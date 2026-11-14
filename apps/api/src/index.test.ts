import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildServer } from './index.ts';

test('GET /health returns ok', async () => {
  const app = buildServer();
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
