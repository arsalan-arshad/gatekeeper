import assert from 'node:assert/strict';
import { test } from 'node:test';

/** Mirror of API tag pattern for client-side copy/docs sanity. */
const DIRECTORY_TAG_PATTERN = /^[a-z0-9][a-z0-9+#.-]{0,31}$/;

test('directory tag pattern accepts lowercase slugs', () => {
  assert.equal(DIRECTORY_TAG_PATTERN.test('saas'), true);
  assert.equal(DIRECTORY_TAG_PATTERN.test('c++'), true);
  assert.equal(DIRECTORY_TAG_PATTERN.test('node.js'), true);
  assert.equal(DIRECTORY_TAG_PATTERN.test('BAD'), false);
  assert.equal(DIRECTORY_TAG_PATTERN.test('has space'), false);
});
