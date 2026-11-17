import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  NOINDEX_NOFOLLOW,
  matchPublicProfilePath,
  shouldSetNoindexNofollow,
} from './robots-header.ts';

test('unknown public handle → noindex,nofollow; valid handle stays indexable', () => {
  assert.equal(shouldSetNoindexNofollow('/@no-such-user-xyz', false), true);
  assert.equal(shouldSetNoindexNofollow('/@no-such-user-xyz/ledger', false), true);
  assert.equal(shouldSetNoindexNofollow('/@demo', true), false);
  assert.equal(shouldSetNoindexNofollow('/@ada', true), false);
  assert.equal(shouldSetNoindexNofollow('/@ada/ledger', true), false);
  // Existence unknown: do not noindex (fail open for real profiles).
  assert.equal(shouldSetNoindexNofollow('/@ada', null), false);
  assert.equal(shouldSetNoindexNofollow('/@ada', undefined), false);
});

test('static public pages stay indexable; dashboard/auth do not', () => {
  assert.equal(shouldSetNoindexNofollow('/'), false);
  assert.equal(shouldSetNoindexNofollow('/start'), false);
  assert.equal(shouldSetNoindexNofollow('/ledger'), false);
  assert.equal(shouldSetNoindexNofollow('/explore'), false);
  assert.equal(shouldSetNoindexNofollow('/privacy'), false);
  assert.equal(shouldSetNoindexNofollow('/terms'), false);
  assert.equal(shouldSetNoindexNofollow('/dashboard'), true);
  assert.equal(shouldSetNoindexNofollow('/start/check-email'), true);
  assert.equal(shouldSetNoindexNofollow('/api/auth/signin'), true);
});

test('matchPublicProfilePath extracts handle', () => {
  assert.deepEqual(matchPublicProfilePath('/@Demo'), { handle: 'demo', isLedger: false });
  assert.deepEqual(matchPublicProfilePath('/@ada/ledger'), { handle: 'ada', isLedger: true });
  assert.equal(matchPublicProfilePath('/start'), null);
});

test('NOINDEX_NOFOLLOW constant is the header value', () => {
  assert.equal(NOINDEX_NOFOLLOW, 'noindex, nofollow');
});
