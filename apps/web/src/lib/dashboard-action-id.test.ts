import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateActionId } from '../app/dashboard/actions.ts';

test('validateActionId accepts UUIDs and rejects path traversal', () => {
  assert.deepEqual(validateActionId('11111111-1111-4111-8111-111111111111'), {
    ok: true,
    id: '11111111-1111-4111-8111-111111111111',
  });
  assert.deepEqual(validateActionId('../../inbox'), { ok: false, error: 'Invalid id' });
  assert.deepEqual(validateActionId('../matches'), { ok: false, error: 'Invalid id' });
  assert.deepEqual(validateActionId('not-a-uuid'), { ok: false, error: 'Invalid id' });
  assert.deepEqual(validateActionId(''), { ok: false, error: 'Invalid id' });
});
