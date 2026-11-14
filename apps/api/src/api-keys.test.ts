import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractBearerOrApiKey, generateApiKey, hashApiKey } from './api-keys.ts';

test('generateApiKey returns gk_ prefix', () => {
  const key = generateApiKey();
  assert.match(key, /^gk_[a-f0-9]+$/);
});

test('hashApiKey is stable sha256 hex', () => {
  assert.equal(hashApiKey('gk_test'), hashApiKey('gk_test'));
  assert.notEqual(hashApiKey('gk_test'), hashApiKey('gk_other'));
  assert.equal(hashApiKey('gk_test').length, 64);
});

test('extractBearerOrApiKey reads Authorization or X-API-Key', () => {
  assert.equal(extractBearerOrApiKey({ authorization: 'Bearer gk_abc' }), 'gk_abc');
  assert.equal(extractBearerOrApiKey({ 'x-api-key': 'gk_xyz' }), 'gk_xyz');
  assert.equal(extractBearerOrApiKey({}), null);
});
