import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  HANDLE_TAKEN_ERROR,
  isHandleUniqueViolation,
  replyForHandleClaimError,
} from './pg-errors.ts';

test('isHandleUniqueViolation detects 23505 on handle / users_handle_unique', () => {
  assert.equal(
    isHandleUniqueViolation({
      code: '23505',
      constraint_name: 'users_handle_unique',
      detail: 'Key (handle)=(ada) already exists.',
    }),
    true,
  );
  assert.equal(
    isHandleUniqueViolation({
      code: '23505',
      detail: 'Key (handle)=(ada) already exists.',
    }),
    true,
  );
  assert.equal(
    isHandleUniqueViolation({
      code: '23505',
      column: 'handle',
    }),
    true,
  );
});

test('isHandleUniqueViolation unwraps drizzle/postgres cause chain', () => {
  assert.equal(
    isHandleUniqueViolation({
      message: 'Failed query',
      cause: {
        code: '23505',
        constraint_name: 'users_handle_unique',
      },
    }),
    true,
  );
});

test('isHandleUniqueViolation does not swallow other DB errors', () => {
  assert.equal(
    isHandleUniqueViolation({ code: '23505', constraint_name: 'users_email_unique' }),
    false,
  );
  assert.equal(
    isHandleUniqueViolation({
      code: '23505',
      detail: 'Key (email)=(a@b.c) already exists.',
    }),
    false,
  );
  assert.equal(
    isHandleUniqueViolation({ code: '23503', constraint_name: 'users_handle_unique' }),
    false,
  );
  assert.equal(isHandleUniqueViolation({ code: '42P01' }), false);
  assert.equal(isHandleUniqueViolation(new Error('boom')), false);
  assert.equal(isHandleUniqueViolation(null), false);
});

test('HANDLE_TAKEN_ERROR is the 409 body value', () => {
  assert.equal(HANDLE_TAKEN_ERROR, 'handle_taken');
});

test('simulate unique violation → 409 + handle_taken body', () => {
  const reply = replyForHandleClaimError({
    code: '23505',
    constraint_name: 'users_handle_unique',
    detail: 'Key (handle)=(ada) already exists.',
  });
  assert.deepEqual(reply, { status: 409, body: { error: 'handle_taken' } });
  assert.equal(replyForHandleClaimError({ code: '57014' }), null);
});
