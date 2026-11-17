import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BRAND } from '../lib/brand.ts';
import { publishedHandleSitemapEntries } from '../lib/sitemap-handles.ts';
import sitemap from './sitemap.ts';

test('sitemap lists public URLs and excludes dashboard/auth/u', async () => {
  const entries = await sitemap();
  const urls = entries.map((e) => e.url);
  const expected = [
    `${BRAND.siteUrl}/`,
    `${BRAND.siteUrl}/start`,
    `${BRAND.siteUrl}/ledger`,
    `${BRAND.siteUrl}/explore`,
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

test('sitemap includes published handle and excludes unpublished', () => {
  const updatedAt = new Date('2025-03-01T00:00:00.000Z');
  const entries = publishedHandleSitemapEntries(
    [
      { handle: 'published-user', updatedAt, published: true },
      { handle: 'secret-draft', updatedAt, published: false },
      { handle: 'ada', updatedAt, published: true },
      { handle: 'e2ehzyrvm', updatedAt, published: true },
      { handle: 'testfounder-gk', updatedAt, published: true },
      { handle: 'arsalan-a-software-engin', updatedAt, published: true },
      { handle: 'arsalandev', updatedAt, published: true },
    ],
    BRAND.siteUrl,
  );
  const urls = entries.map((e) => e.url);
  assert.ok(urls.includes(`${BRAND.siteUrl}/@published-user`));
  assert.ok(urls.includes(`${BRAND.siteUrl}/@arsalandev`));
  assert.ok(!urls.includes(`${BRAND.siteUrl}/@secret-draft`));
  assert.ok(!urls.includes(`${BRAND.siteUrl}/@ada`));
  assert.ok(!urls.includes(`${BRAND.siteUrl}/@e2ehzyrvm`));
  assert.ok(!urls.includes(`${BRAND.siteUrl}/@testfounder-gk`));
  assert.ok(!urls.includes(`${BRAND.siteUrl}/@arsalan-a-software-engin`));
  assert.ok(!urls.some((u) => u.includes('/ledger')));
});
