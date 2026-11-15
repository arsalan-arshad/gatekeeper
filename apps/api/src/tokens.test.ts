import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  assertEmailLinkSecretConfigured,
  createOptInToken,
  resolveEmailLinkSecret,
  verifyOptInToken,
} from './tokens.ts';

const env = { AUTH_SECRET: 'test-secret-for-opt-in-links-32chars!!' };

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

test('resolveEmailLinkSecret rejects missing or short secrets', () => {
  assert.throws(() => resolveEmailLinkSecret({}), /at least 32/);
  assert.throws(() => resolveEmailLinkSecret({ AUTH_SECRET: 'short' }), /at least 32/);
  assert.equal(resolveEmailLinkSecret(env), env.AUTH_SECRET);
});

test('assertEmailLinkSecretConfigured fails startup on short secret', () => {
  assert.throws(() => assertEmailLinkSecretConfigured({ AUTH_SECRET: 'tiny' }), /at least 32/);
  assert.doesNotThrow(() => assertEmailLinkSecretConfigured(env));
});
