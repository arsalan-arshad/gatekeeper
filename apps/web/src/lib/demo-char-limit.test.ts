import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEMO_MESSAGE_MAX_CHARS,
  demoCharCounterLabel,
  demoMessageOverLimit,
} from './demo-char-limit.ts';

test('demo judge disables above 2000 characters', () => {
  assert.equal(DEMO_MESSAGE_MAX_CHARS, 2000);
  assert.equal(demoMessageOverLimit(2000), false);
  assert.equal(demoMessageOverLimit(2001), true);
  assert.equal(demoCharCounterLabel(12), '12/2000');
});
