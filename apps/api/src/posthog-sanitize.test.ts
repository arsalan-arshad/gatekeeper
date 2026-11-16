import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sanitizeServerAnalyticsProps } from './posthog-sanitize.ts';

test('server analytics sanitizer drops PII and handle', () => {
  const cleaned = sanitizeServerAnalyticsProps({
    band: 'reject',
    email: 'a@b.com',
    message: 'hi',
    handle: 'alice',
    token: 'x',
  });
  assert.deepEqual(cleaned, { band: 'reject' });
});
