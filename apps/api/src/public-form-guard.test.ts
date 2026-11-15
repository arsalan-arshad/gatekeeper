import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resetRateLimitersForTests } from './rate-limit.ts';
import { guardPublicFormRequest } from './routes/public.ts';

test('missing handle returns 404 without consuming IP quota', async () => {
  resetRateLimitersForTests();
  let ipCalls = 0;
  const gate = await guardPublicFormRequest({
    handle: 'no-such-user',
    ip: '9.9.9.9',
    senderContact: 'a@b.co',
    lookupOwner: async () => null,
    checkIp: async () => {
      ipCalls += 1;
      return { ok: true, remaining: 4, resetMs: 60_000 };
    },
    checkSender: async () => ({ ok: true, remaining: 2, resetMs: 86_400_000 }),
  });

  assert.equal(gate.ok, false);
  if (!gate.ok) {
    assert.equal(gate.status, 404);
  }
  assert.equal(ipCalls, 0);
});

test('existing handle consumes IP quota once', async () => {
  resetRateLimitersForTests();
  let ipCalls = 0;
  const gate = await guardPublicFormRequest({
    handle: 'ada',
    ip: '9.9.9.9',
    senderContact: 'a@b.co',
    lookupOwner: async () => ({ id: 'owner-1' }),
    checkIp: async () => {
      ipCalls += 1;
      return { ok: true, remaining: 4, resetMs: 60_000 };
    },
    checkSender: async () => ({ ok: true, remaining: 2, resetMs: 86_400_000 }),
  });

  assert.equal(gate.ok, true);
  assert.equal(ipCalls, 1);
});
