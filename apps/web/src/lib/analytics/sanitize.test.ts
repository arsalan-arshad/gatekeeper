import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bandFromDecision, sanitizeAnalyticsPath, sanitizeAnalyticsProps } from './sanitize.ts';

test('sanitizeAnalyticsProps strips email, message, token, and related PII keys', () => {
  const cleaned = sanitizeAnalyticsProps({
    band: 'accept',
    surface: 'landing',
    email: 'a@b.com',
    senderContact: 'x@y.com',
    message: 'secret pitch',
    body: 'nope',
    token: 'abc',
    authorization: 'Bearer x',
    score: 99,
    reason: 'because',
  });
  assert.deepEqual(cleaned, { band: 'accept', surface: 'landing' });
});

test('sanitizeAnalyticsProps returns undefined for empty or fully blocked input', () => {
  assert.equal(sanitizeAnalyticsProps(undefined), undefined);
  assert.equal(sanitizeAnalyticsProps({ email: 'a@b.com' }), undefined);
});

test('sanitizeAnalyticsPath strips email and token query params', () => {
  assert.equal(sanitizeAnalyticsPath('/start?email=a%40b.com&redo=1'), '/start?redo=1');
  assert.equal(sanitizeAnalyticsPath('/dashboard'), '/dashboard');
});

test('bandFromDecision only allows spam|reject|accept', () => {
  assert.equal(bandFromDecision('accept'), 'accept');
  assert.equal(bandFromDecision('spam'), 'spam');
  assert.equal(bandFromDecision('pending'), null);
});
