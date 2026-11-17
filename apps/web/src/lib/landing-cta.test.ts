import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveLandingCta } from './landing-cta.ts';

test('logged-out Start free → /start', () => {
  const cta = resolveLandingCta({ signedIn: false, hasPublishedHandle: false });
  assert.equal(cta.label, 'Start free');
  assert.equal(cta.href, '/start');
  assert.equal(cta.cta_variant, 'start_free');
});

test('logged-in with published handle → Go to dashboard /dashboard', () => {
  const cta = resolveLandingCta({ signedIn: true, hasPublishedHandle: true });
  assert.equal(cta.label, 'Go to dashboard');
  assert.equal(cta.href, '/dashboard');
  assert.equal(cta.cta_variant, 'dashboard');
});

test('logged-in without published handle → Finish setup /start', () => {
  const cta = resolveLandingCta({ signedIn: true, hasPublishedHandle: false });
  assert.equal(cta.label, 'Finish setup');
  assert.equal(cta.href, '/start');
  assert.equal(cta.cta_variant, 'finish_setup');
});

test('logged-out ignores hasPublishedHandle flag', () => {
  const cta = resolveLandingCta({ signedIn: false, hasPublishedHandle: true });
  assert.equal(cta.cta_variant, 'start_free');
  assert.equal(cta.href, '/start');
});
