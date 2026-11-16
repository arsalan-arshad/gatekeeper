import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BRAND } from '../lib/brand.ts';
import sitemap from './sitemap.ts';

test('sitemap lists public URLs and excludes dashboard/auth/u', () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);
  const expected = [
    `${BRAND.siteUrl}/`,
    `${BRAND.siteUrl}/start`,
    `${BRAND.siteUrl}/ledger`,
    `${BRAND.siteUrl}/@demo`,
    `${BRAND.siteUrl}/@demo/ledger`,
    `${BRAND.siteUrl}/privacy`,
    `${BRAND.siteUrl}/terms`,
  ];
  for (const url of expected) {
    assert.ok(urls.includes(url), `expected ${url}`);
  }
  assert.ok(!urls.some((u) => u.includes('/dashboard')));
  assert.ok(!urls.some((u) => u.includes('/check-email')));
  assert.ok(!urls.some((u) => u.includes('/u/')));
  assert.ok(!urls.some((u) => u.includes('/api/')));
});
