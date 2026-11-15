import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BRAND, studioLink } from './brand.ts';

test('brand name is Gatekeeper', () => {
  assert.equal(BRAND.name, 'Gatekeeper');
});

test('brand headline matches product positioning', () => {
  assert.match(BRAND.tagline, /Let anyone reach you/i);
  assert.match(BRAND.summary, /AI principal/i);
});

test('creator credit points at arsalandev.studio with UTM', () => {
  assert.equal(BRAND.creator.name, 'Arsalan');
  assert.match(studioLink('footer'), /utm_source=gatekeeper/);
  assert.match(studioLink('footer'), /utm_medium=footer/);
  assert.match(studioLink('landing'), /utm_medium=landing/);
});

test('social links have no hardcoded arsalanadev fallbacks', () => {
  // When env unset, links are null so the footer hides them.
  assert.equal(BRAND.xUrl, null);
  assert.equal(BRAND.linkedinUrl, null);
});

test('siteUrl defaults to production gatekeeper host', () => {
  assert.match(BRAND.siteUrl, /^https:\/\/gatekeeper\.arsalandev\.studio$/);
});
