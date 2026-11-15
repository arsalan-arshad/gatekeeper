import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeEmailForRateLimit } from './email-normalize.ts';

test('normalizeEmailForRateLimit lowercases and strips +alias', () => {
  assert.equal(normalizeEmailForRateLimit('Ada+1@Example.COM'), 'ada@example.com');
  assert.equal(normalizeEmailForRateLimit('a+2@example.com'), 'a@example.com');
  assert.equal(
    normalizeEmailForRateLimit('a+1@example.com'),
    normalizeEmailForRateLimit('a+2@example.com'),
  );
});

test('normalizeEmailForRateLimit strips gmail dots and aliases', () => {
  assert.equal(normalizeEmailForRateLimit('a.b+news@gmail.com'), 'ab@gmail.com');
  assert.equal(
    normalizeEmailForRateLimit('a.b+1@gmail.com'),
    normalizeEmailForRateLimit('ab+2@gmail.com'),
  );
  assert.equal(normalizeEmailForRateLimit('A.B@googlemail.com'), 'ab@googlemail.com');
});

test('normalizeEmailForRateLimit leaves non-gmail dots alone', () => {
  assert.equal(normalizeEmailForRateLimit('a.b@example.com'), 'a.b@example.com');
});
