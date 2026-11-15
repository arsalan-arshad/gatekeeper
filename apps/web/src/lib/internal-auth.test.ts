import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import { INTERNAL_TOKEN_MAX_TTL_SECONDS, signInternalToken } from './internal-auth.ts';

test('web signInternalToken produces verifiable HS256 JWT shape', () => {
  const secret = 'web-side-secret';
  const now = 1_700_000_000;
  const token = signInternalToken('Owner@Example.com', secret, 60, now);
  const [headerB64, payloadB64, sig] = token.split('.');
  assert.ok(headerB64 && payloadB64 && sig);

  const expected = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  assert.equal(sig, expected);

  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
    sub: string;
    exp: number;
    iat: number;
  };
  assert.equal(payload.sub, 'owner@example.com');
  assert.equal(payload.exp - payload.iat, INTERNAL_TOKEN_MAX_TTL_SECONDS);
});

test('web signInternalToken caps ttl at 60s', () => {
  const now = 1_700_000_000;
  const token = signInternalToken('a@b.co', 'secret', 999, now);
  const payloadB64 = token.split('.')[1]!;
  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
    exp: number;
    iat: number;
  };
  assert.equal(payload.exp - payload.iat, 60);
});
