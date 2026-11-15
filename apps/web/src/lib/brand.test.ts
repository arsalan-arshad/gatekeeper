import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BRAND } from './brand.ts';

test('brand name is Gatekeeper', () => {
  assert.equal(BRAND.name, 'Gatekeeper');
});

test('brand headline matches product positioning', () => {
  assert.match(BRAND.tagline, /Let anyone reach you/i);
  assert.match(BRAND.summary, /AI principal/i);
});
