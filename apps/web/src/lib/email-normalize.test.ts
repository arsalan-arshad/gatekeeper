import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeEmailForRateLimit } from './email-normalize.ts';

test('web normalizeEmailForRateLimit matches alias-collapse rules', () => {
  assert.equal(normalizeEmailForRateLimit('Ada+1@Example.COM'), 'ada@example.com');
  assert.equal(normalizeEmailForRateLimit('a.b+news@gmail.com'), 'ab@gmail.com');
  assert.equal(normalizeEmailForRateLimit('a.b@example.com'), 'a.b@example.com');
});
