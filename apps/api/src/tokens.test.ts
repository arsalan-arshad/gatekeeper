import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createOptInToken, verifyOptInToken } from './tokens.ts';

const env = { AUTH_SECRET: 'test-secret-for-opt-in' };

test('opt-in tokens verify for the matching request and action', () => {
  const token = createOptInToken({ requestId: 'req-1', action: 'accept' }, { env });
  const result = verifyOptInToken(token, { requestId: 'req-1', action: 'accept' }, { env });
  assert.equal(result.ok, true);
});

test('opt-in tokens reject wrong action, request, or expiry', () => {
  const token = createOptInToken(
    { requestId: 'req-1', action: 'accept' },
    { env, now: 1_000, ttlSeconds: 10 },
  );

  assert.equal(
    verifyOptInToken(token, { requestId: 'req-1', action: 'decline' }, { env, now: 1_005 }).ok,
    false,
  );
  assert.equal(
    verifyOptInToken(token, { requestId: 'req-2', action: 'accept' }, { env, now: 1_005 }).ok,
    false,
  );
  assert.equal(
    verifyOptInToken(token, { requestId: 'req-1', action: 'accept' }, { env, now: 2_000 }).ok,
    false,
  );
});
