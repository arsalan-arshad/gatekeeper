import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalizeEmailForRateLimit } from './email-normalize.ts';
import { gateMagicLinkSend } from './magic-rate-limit.ts';

test('gateMagicLinkSend fails closed with 503 when limiter throws', async () => {
  const logs: unknown[] = [];
  const gate = await gateMagicLinkSend('user@example.com', '1.2.3.4', {
    allow: async () => {
      throw new Error('db down');
    },
    log: (err) => {
      logs.push(err);
    },
  });

  assert.deepEqual(gate, { ok: false, status: 503 });
  assert.equal(logs.length, 1);
});

test('gateMagicLinkSend returns 429 when quota exhausted (not open)', async () => {
  const gate = await gateMagicLinkSend('user@example.com', '1.2.3.4', {
    allow: async () => false,
  });
  assert.deepEqual(gate, { ok: false, status: 429 });
});

test('gateMagicLinkSend allows when limiter ok', async () => {
  const gate = await gateMagicLinkSend('user@example.com', '1.2.3.4', {
    allow: async () => true,
  });
  assert.deepEqual(gate, { ok: true });
});

test('magic-link rate-limit email keys collapse aliases', () => {
  assert.equal(normalizeEmailForRateLimit('a+1@gmail.com'), 'a@gmail.com');
  assert.equal(normalizeEmailForRateLimit('First+tag@Gmail.com'), 'first@gmail.com');
  assert.equal(normalizeEmailForRateLimit('f.i.r.s.t+x@gmail.com'), 'first@gmail.com');
  assert.equal(
    normalizeEmailForRateLimit('a+1@gmail.com'),
    normalizeEmailForRateLimit('a+2@gmail.com'),
  );
});
