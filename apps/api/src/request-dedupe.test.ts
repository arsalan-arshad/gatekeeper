import assert from 'node:assert/strict';
import { test } from 'node:test';

import { messageDedupeHash, normalizeMessageForDedupe } from './request-dedupe.ts';

test('normalizeMessageForDedupe collapses case and whitespace', () => {
  assert.equal(normalizeMessageForDedupe('  Hello   World\n'), 'hello world');
});

test('messageDedupeHash is stable for equivalent messages', () => {
  const a = messageDedupeHash('Hello  World');
  const b = messageDedupeHash('hello world');
  assert.equal(a, b);
  assert.notEqual(messageDedupeHash('hello world!'), a);
});
