import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BRAND } from './brand.ts';
import { absoluteUrl, publicPageMetadata } from './seo.ts';

test('absoluteUrl uses BRAND.siteUrl and never localhost by default', () => {
  assert.match(BRAND.siteUrl, /^https:\/\/gatekeeper\.arsalandev\.studio$/);
  assert.equal(absoluteUrl('/'), `${BRAND.siteUrl}/`);
  assert.equal(absoluteUrl('/start'), `${BRAND.siteUrl}/start`);
  assert.equal(absoluteUrl('/@demo'), `${BRAND.siteUrl}/@demo`);
  assert.doesNotMatch(absoluteUrl('/privacy'), /localhost/i);
});

test('publicPageMetadata sets canonical and matching OG/Twitter', () => {
  const meta = publicPageMetadata({
    title: 'Privacy — Gatekeeper',
    description: 'Privacy details',
    path: '/privacy',
  });
  assert.equal(meta.title, 'Privacy — Gatekeeper');
  assert.equal(meta.description, 'Privacy details');
  assert.equal(meta.alternates?.canonical, `${BRAND.siteUrl}/privacy`);
  assert.equal(meta.openGraph?.url, `${BRAND.siteUrl}/privacy`);
  assert.equal(meta.openGraph?.title, 'Privacy — Gatekeeper');
  assert.equal(meta.twitter?.title, 'Privacy — Gatekeeper');
});
