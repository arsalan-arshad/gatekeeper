import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BODY_LIMIT_BYTES, MESSAGE_MAX_CHARS } from './request-limits.ts';

test('request size limits are launch-safe ceilings', () => {
  assert.equal(BODY_LIMIT_BYTES, 64 * 1024);
  assert.equal(MESSAGE_MAX_CHARS, 4000);
  assert.ok(MESSAGE_MAX_CHARS * 4 < BODY_LIMIT_BYTES);
});
