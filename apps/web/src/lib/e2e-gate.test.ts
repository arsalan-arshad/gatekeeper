import assert from 'node:assert/strict';
import { test } from 'node:test';

import { e2eSecretsEqual, isE2eLoginEnabled } from './e2e-gate.ts';

test('isE2eLoginEnabled requires non-prod + E2E_ENABLED=1 + secret', () => {
  assert.equal(
    isE2eLoginEnabled({ NODE_ENV: 'development', E2E_ENABLED: '1', E2E_SECRET: 'x' }),
    true,
  );
  assert.equal(isE2eLoginEnabled({ NODE_ENV: 'test', E2E_ENABLED: '1', E2E_SECRET: 'x' }), true);
  assert.equal(
    isE2eLoginEnabled({ NODE_ENV: 'production', E2E_ENABLED: '1', E2E_SECRET: 'x' }),
    false,
  );
  assert.equal(
    isE2eLoginEnabled({ NODE_ENV: 'development', E2E_ENABLED: '0', E2E_SECRET: 'x' }),
    false,
  );
  assert.equal(
    isE2eLoginEnabled({ NODE_ENV: 'development', E2E_ENABLED: '1', E2E_SECRET: '' }),
    false,
  );
  assert.equal(isE2eLoginEnabled({ NODE_ENV: 'development', E2E_SECRET: 'x' }), false);
});

test('e2eSecretsEqual uses constant-time equality', () => {
  assert.equal(e2eSecretsEqual('same', 'same'), true);
  assert.equal(e2eSecretsEqual('same', 'diff'), false);
  assert.equal(e2eSecretsEqual('short', 'longer'), false);
});
