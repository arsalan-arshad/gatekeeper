import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildServer } from './index.ts';
import { signInternalToken } from './internal-auth.ts';

const SECRET = 'payments-routes-test-secret';

function authHeaders(email: string): Record<string, string> {
  return { authorization: `Bearer ${signInternalToken(email, SECRET)}` };
}

function withSecret<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.INTERNAL_API_SECRET;
  process.env.INTERNAL_API_SECRET = SECRET;
  return fn().finally(() => {
    if (previous === undefined) delete process.env.INTERNAL_API_SECRET;
    else process.env.INTERNAL_API_SECRET = previous;
  });
}

test('GET /v1/payments/config reports flag off by default', async () => {
  await withSecret(async () => {
    const previous = process.env.PAYMENTS_ENABLED;
    delete process.env.PAYMENTS_ENABLED;

    const app = await buildServer();
    app.log.level = 'silent';
    const response = await app.inject({
      method: 'GET',
      url: '/v1/payments/config',
      headers: authHeaders('ada@example.com'),
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().enabled, false);

    await app.close();
    if (previous !== undefined) process.env.PAYMENTS_ENABLED = previous;
  });
});

test('POST /v1/payments/checkout is 503 when payments disabled', async () => {
  await withSecret(async () => {
    const previous = process.env.PAYMENTS_ENABLED;
    process.env.PAYMENTS_ENABLED = 'false';

    const app = await buildServer();
    app.log.level = 'silent';
    const response = await app.inject({
      method: 'POST',
      url: '/v1/payments/checkout',
      headers: authHeaders('ada@example.com'),
      payload: { kind: 'pro' },
    });
    assert.equal(response.statusCode, 503);
    assert.match(response.json().error, /disabled/i);

    await app.close();
    if (previous !== undefined) process.env.PAYMENTS_ENABLED = previous;
    else delete process.env.PAYMENTS_ENABLED;
  });
});

test('POST /v1/payments/waitlist rejects missing auth', async () => {
  await withSecret(async () => {
    const app = await buildServer();
    app.log.level = 'silent';
    const response = await app.inject({
      method: 'POST',
      url: '/v1/payments/waitlist',
      payload: { email: 'wait@example.com' },
    });
    assert.equal(response.statusCode, 401);
    await app.close();
  });
});

test('POST /v1/payments/waitlist rejects x-user-email without JWT', async () => {
  await withSecret(async () => {
    const app = await buildServer();
    app.log.level = 'silent';
    const response = await app.inject({
      method: 'POST',
      url: '/v1/payments/waitlist',
      headers: { 'x-user-email': 'ada@example.com' },
      payload: { email: 'wait@example.com' },
    });
    assert.equal(response.statusCode, 401);
    await app.close();
  });
});

test('POST /v1/payments/waitlist rejects invalid email', async () => {
  await withSecret(async () => {
    const app = await buildServer();
    app.log.level = 'silent';
    const response = await app.inject({
      method: 'POST',
      url: '/v1/payments/waitlist',
      headers: authHeaders('ada@example.com'),
      payload: { email: 'not-an-email' },
    });
    assert.equal(response.statusCode, 400);
    await app.close();
  });
});
