import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeHandle } from './handle.ts';

test('normalizeHandle strips @ and lowercases', () => {
  assert.equal(normalizeHandle('@Ada_Founder'), 'ada-founder');
});
