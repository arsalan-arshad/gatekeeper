import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BRAND } from './brand.ts';

test('brand name is Gatekeeper', () => {
  assert.equal(BRAND.name, 'Gatekeeper');
});
