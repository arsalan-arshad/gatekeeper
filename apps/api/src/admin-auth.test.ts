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

test('checkAdminToken rejects query ?token= (Bearer only)', () => {
  const previous = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = 'secret-token';
  try {
    const viaQuery = checkAdminToken({
      query: { token: 'secret-token' },
      headers: {},
    });
    assert.equal(viaQuery.ok, false);
    if (!viaQuery.ok) assert.equal(viaQuery.status, 401);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = previous;
  }
});

test('checkAdminToken accepts Authorization Bearer with timingSafeEqual', () => {
  const previous = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = 'abc+def/ghi=';
  try {
    const viaBearer = checkAdminToken({
      query: {},
      headers: { authorization: 'Bearer abc+def/ghi=' },
    });
    assert.equal(viaBearer.ok, true);

    const wrong = checkAdminToken({
      query: {},
      headers: { authorization: 'Bearer wrong-token!!' },
    });
    assert.equal(wrong.ok, false);
    if (!wrong.ok) assert.equal(wrong.status, 401);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = previous;
  }
});

test('checkAdminToken ignores mismatched query when Bearer present', () => {
  const previous = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = 'real';
  try {
    const result = checkAdminToken({
      query: { token: 'wrong' },
      headers: { authorization: 'Bearer real' },
    });
    assert.equal(result.ok, true);

    const queryOnly = checkAdminToken({
      query: { token: 'real' },
      headers: {},
    });
    assert.equal(queryOnly.ok, false);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = previous;
  }
});
