import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkAdminToken } from './admin-auth.ts';

test('checkAdminToken returns 503 when ADMIN_TOKEN unset', () => {
  const previous = process.env.ADMIN_TOKEN;
  delete process.env.ADMIN_TOKEN;
  try {
    const result = checkAdminToken({ query: {}, headers: {} });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 503);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = previous;
  }
});

test('checkAdminToken accepts query token and trims env newline', () => {
  const previous = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = 'secret-token\n';
  try {
    const ok = checkAdminToken({
      query: { token: 'secret-token' },
      headers: {},
    });
    assert.equal(ok.ok, true);

    const bad = checkAdminToken({
      query: { token: 'wrong' },
      headers: {},
    });
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.status, 401);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = previous;
  }
});

test('checkAdminToken accepts Authorization Bearer (avoids + query decoding)', () => {
  const previous = process.env.ADMIN_TOKEN;
  // Tokens with + are mangled by application/x-www-form-urlencoded query parsers.
  process.env.ADMIN_TOKEN = 'abc+def/ghi=';
  try {
    const viaBearer = checkAdminToken({
      query: {},
      headers: { authorization: 'Bearer abc+def/ghi=' },
    });
    assert.equal(viaBearer.ok, true);

    const viaQueryBroken = checkAdminToken({
      // Simulates Fastify/querystring turning + into space
      query: { token: 'abc def/ghi=' },
      headers: {},
    });
    assert.equal(viaQueryBroken.ok, false);

    const viaQueryEncoded = checkAdminToken({
      query: { token: 'abc+def/ghi=' },
      headers: {},
    });
    assert.equal(viaQueryEncoded.ok, true);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = previous;
  }
});

test('checkAdminToken prefers Bearer over mismatched query token', () => {
  const previous = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = 'real';
  try {
    const result = checkAdminToken({
      query: { token: 'wrong' },
      headers: { authorization: 'Bearer real' },
    });
    assert.equal(result.ok, true);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = previous;
  }
});
