import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import { buildServer } from './index.ts';
import {
  INTERNAL_TOKEN_MAX_TTL_SECONDS,
  isInternalAuthProtectedPath,
  signInternalToken,
  verifyInternalToken,
} from './internal-auth.ts';

const SECRET = 'test-internal-api-secret-for-unit-tests';

function withSecret<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.INTERNAL_API_SECRET;
  process.env.INTERNAL_API_SECRET = SECRET;
  return fn().finally(() => {
    if (previous === undefined) delete process.env.INTERNAL_API_SECRET;
    else process.env.INTERNAL_API_SECRET = previous;
  });
}

function forgeToken(email: string, secret: string, exp: number, iat: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: email, exp, iat })).toString('base64url');
  const data = `${header}.${payload}`;
  const sig = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

test('signInternalToken + verifyInternalToken round-trip', () => {
  const now = 1_700_000_000;
  const token = signInternalToken('Ada@Example.com', SECRET, 60, now);
  const verified = verifyInternalToken(token, SECRET, now + 1);
  assert.equal(verified.ok, true);
  if (verified.ok) {
    assert.equal(verified.email, 'ada@example.com');
    assert.equal(verified.payload.exp, now + 60);
  }
});

test('verifyInternalToken rejects forged signature', () => {
  const now = 1_700_000_000;
  const token = signInternalToken('ada@example.com', SECRET, 60, now);
  const forged = `${token.slice(0, -4)}aaaa`;
  const verified = verifyInternalToken(forged, SECRET, now + 1);
  assert.equal(verified.ok, false);
});

test('verifyInternalToken rejects expired token', () => {
  const now = 1_700_000_000;
  const token = signInternalToken('ada@example.com', SECRET, 30, now);
  const verified = verifyInternalToken(token, SECRET, now + 31);
  assert.equal(verified.ok, false);
  if (!verified.ok) assert.match(verified.error, /expired/i);
});

test('verifyInternalToken rejects ttl longer than max', () => {
  const now = 1_700_000_000;
  const token = forgeToken(
    'ada@example.com',
    SECRET,
    now + INTERNAL_TOKEN_MAX_TTL_SECONDS + 1,
    now,
  );
  const verified = verifyInternalToken(token, SECRET, now + 1);
  assert.equal(verified.ok, false);
});

test('isInternalAuthProtectedPath covers required prefixes and lemon exception', () => {
  assert.equal(isInternalAuthProtectedPath('/v1/dashboard/inbox'), true);
  assert.equal(isInternalAuthProtectedPath('/v1/api-keys'), true);
  assert.equal(isInternalAuthProtectedPath('/v1/keys'), true);
  assert.equal(isInternalAuthProtectedPath('/v1/onboarding/me'), true);
  assert.equal(isInternalAuthProtectedPath('/v1/onboarding/questions'), true);
  assert.equal(isInternalAuthProtectedPath('/v1/payments/me'), true);
  assert.equal(isInternalAuthProtectedPath('/v1/payments/config'), true);
  assert.equal(isInternalAuthProtectedPath('/v1/payments/webhooks/lemon'), false);
  assert.equal(isInternalAuthProtectedPath('/health'), false);
  assert.equal(isInternalAuthProtectedPath('/v1/public/foo'), false);
});

const PROTECTED_PROBE_PATHS = [
  '/v1/dashboard/inbox',
  '/v1/api-keys',
  '/v1/onboarding/me',
  '/v1/payments/me',
] as const;

test('curl-equivalent: only x-user-email → 401 on all protected routes', async () => {
  await withSecret(async () => {
    const app = await buildServer();
    app.log.level = 'silent';
    try {
      for (const url of PROTECTED_PROBE_PATHS) {
        const response = await app.inject({
          method: 'GET',
          url,
          headers: { 'x-user-email': 'attacker@evil.example' },
        });
        assert.equal(response.statusCode, 401, url);
        assert.equal(response.json().error, 'Unauthorized');
      }
    } finally {
      await app.close();
    }
  });
});

test('forged and expired Bearer tokens → 401', async () => {
  await withSecret(async () => {
    const app = await buildServer();
    app.log.level = 'silent';
    const now = Math.floor(Date.now() / 1000);
    try {
      const forged = forgeToken('ada@example.com', 'wrong-secret', now + 60, now);
      const forgedRes = await app.inject({
        method: 'GET',
        url: '/v1/dashboard/inbox',
        headers: { authorization: `Bearer ${forged}` },
      });
      assert.equal(forgedRes.statusCode, 401);

      const expired = signInternalToken('ada@example.com', SECRET, 1, now - 120);
      const expiredRes = await app.inject({
        method: 'GET',
        url: '/v1/payments/me',
        headers: { authorization: `Bearer ${expired}` },
      });
      assert.equal(expiredRes.statusCode, 401);
    } finally {
      await app.close();
    }
  });
});

test('valid internal JWT reaches handler (not 401 from auth gate)', async () => {
  await withSecret(async () => {
    const previousDb = process.env.DATABASE_URL;
    // Avoid real DB: auth must pass before DB; missing DB may 500 — assert not 401.
    const app = await buildServer();
    app.log.level = 'silent';
    try {
      const token = signInternalToken('ada@example.com', SECRET);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/payments/config',
        headers: { authorization: `Bearer ${token}` },
      });
      assert.notEqual(response.statusCode, 401);
      assert.equal(response.statusCode, 200);
      assert.equal(typeof response.json().enabled, 'boolean');
    } finally {
      await app.close();
      if (previousDb === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDb;
    }
  });
});

test('OPTIONS from https://evil.example → no Access-Control-Allow-Origin', async () => {
  await withSecret(async () => {
    const previousAppUrl = process.env.APP_URL;
    process.env.APP_URL = 'https://gatekeeper.arsalandev.studio';
    const app = await buildServer();
    app.log.level = 'silent';
    try {
      const evil = await app.inject({
        method: 'OPTIONS',
        url: '/v1/dashboard/inbox',
        headers: {
          origin: 'https://evil.example',
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization,content-type',
        },
      });
      const evilAcao = evil.headers['access-control-allow-origin'];
      assert.ok(
        evilAcao === undefined || evilAcao === false || evilAcao === 'false',
        `evil ACAO should be absent, got ${String(evilAcao)}`,
      );

      const good = await app.inject({
        method: 'OPTIONS',
        url: '/v1/dashboard/inbox',
        headers: {
          origin: 'https://gatekeeper.arsalandev.studio',
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization,content-type',
        },
      });
      assert.equal(
        good.headers['access-control-allow-origin'],
        'https://gatekeeper.arsalandev.studio',
      );

      const allowHeaders = String(good.headers['access-control-allow-headers'] ?? '').toLowerCase();
      assert.ok(!allowHeaders.includes('x-user-email'));
      assert.ok(!allowHeaders.includes('x-internal-secret'));
    } finally {
      await app.close();
      if (previousAppUrl === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = previousAppUrl;
    }
  });
});

test('missing INTERNAL_API_SECRET → 503 on protected routes', async () => {
  const previous = process.env.INTERNAL_API_SECRET;
  delete process.env.INTERNAL_API_SECRET;
  try {
    const app = await buildServer();
    app.log.level = 'silent';
    const response = await app.inject({
      method: 'GET',
      url: '/v1/onboarding/questions',
      headers: { authorization: 'Bearer anything' },
    });
    assert.equal(response.statusCode, 503);
    await app.close();
  } finally {
    if (previous === undefined) delete process.env.INTERNAL_API_SECRET;
    else process.env.INTERNAL_API_SECRET = previous;
  }
});

test('lemon webhook path is not gated by internal auth', async () => {
  await withSecret(async () => {
    const previousPayments = process.env.PAYMENTS_ENABLED;
    process.env.PAYMENTS_ENABLED = 'false';
    const app = await buildServer();
    app.log.level = 'silent';
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/payments/webhooks/lemon',
        headers: { 'content-type': 'application/json' },
        payload: {},
      });
      // Payments disabled acknowledges without internal JWT.
      assert.equal(response.statusCode, 200);
      assert.equal(response.json().ignored, true);
    } finally {
      await app.close();
      if (previousPayments === undefined) delete process.env.PAYMENTS_ENABLED;
      else process.env.PAYMENTS_ENABLED = previousPayments;
    }
  });
});
