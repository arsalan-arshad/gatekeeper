import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveStartDestination } from './start-flow.ts';

test('/start logged-out → magic_link form', () => {
  assert.equal(
    resolveStartDestination({ signedIn: false, hasPublishedHandle: false }),
    'magic_link',
  );
});

test('/start signed-in with published handle → dashboard redirect', () => {
  assert.equal(resolveStartDestination({ signedIn: true, hasPublishedHandle: true }), 'dashboard');
});

test('/start signed-in without published handle → interview (no magic link)', () => {
  assert.equal(resolveStartDestination({ signedIn: true, hasPublishedHandle: false }), 'interview');
});

test('/start redo keeps interview even with published handle', () => {
  assert.equal(
    resolveStartDestination({ signedIn: true, hasPublishedHandle: true, redo: true }),
    'interview',
  );
});
