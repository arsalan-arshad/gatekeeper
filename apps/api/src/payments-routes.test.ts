import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildServer } from './index.ts';

test('GET /v1/payments/config reports flag off by default', async () => {
  const previous = process.env.PAYMENTS_ENABLED;
  delete process.env.PAYMENTS_ENABLED;

  const app = await buildServer();
  app.log.level = 'silent';
  const response = await app.inject({ method: 'GET', url: '/v1/payments/config' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().enabled, false);

  await app.close();
  if (previous !== undefined) process.env.PAYMENTS_ENABLED = previous;
});

test('POST /v1/payments/checkout is 503 when payments disabled', async () => {
  const previous = process.env.PAYMENTS_ENABLED;
  process.env.PAYMENTS_ENABLED = 'false';

  const app = await buildServer();
  app.log.level = 'silent';
  const response = await app.inject({
    method: 'POST',
    url: '/v1/payments/checkout',
    headers: { 'x-user-email': 'ada@example.com' },
    payload: { kind: 'pro' },
  });
  assert.equal(response.statusCode, 503);
  assert.match(response.json().error, /disabled/i);

  await app.close();
  if (previous !== undefined) process.env.PAYMENTS_ENABLED = previous;
  else delete process.env.PAYMENTS_ENABLED;
});
