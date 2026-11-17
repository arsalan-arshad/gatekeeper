import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  publishedHandleSitemapEntries,
  shouldIncludeHandleInSitemap,
} from './sitemap-handles.ts';

test('sitemap includes published handle and excludes unpublished', () => {
  const updatedAt = new Date('2024-06-15T12:00:00.000Z');
  const entries = publishedHandleSitemapEntries(
    [
      { handle: 'alice', updatedAt, published: true },
      { handle: 'drafty', updatedAt, published: false },
      { handle: 'gone', updatedAt, published: true, deleted: true },
    ],
    'https://gatekeeper.example',
  );
  const urls = entries.map((e) => e.url);
  assert.ok(urls.includes('https://gatekeeper.example/@alice'));
  assert.ok(!urls.includes('https://gatekeeper.example/@drafty'));
  assert.ok(!urls.includes('https://gatekeeper.example/@gone'));
  assert.equal(entries[0]?.lastModified?.toISOString(), updatedAt.toISOString());
});

test('sitemap keeps @demo and excludes other test-demo-only handles', () => {
  const updatedAt = new Date('2024-01-01T00:00:00.000Z');
  assert.equal(shouldIncludeHandleInSitemap({ handle: 'demo', updatedAt }), true);
  assert.equal(shouldIncludeHandleInSitemap({ handle: 'ada', updatedAt }), false);
  assert.equal(shouldIncludeHandleInSitemap({ handle: 'jonas', updatedAt }), false);
  assert.equal(shouldIncludeHandleInSitemap({ handle: 'mira', updatedAt }), false);

  const entries = publishedHandleSitemapEntries(
    [
      { handle: 'demo', updatedAt },
      { handle: 'ada', updatedAt },
      { handle: 'real-user', updatedAt },
    ],
    'https://example.com',
  );
  const urls = entries.map((e) => e.url);
  assert.deepEqual(urls, ['https://example.com/@demo', 'https://example.com/@real-user']);
  assert.ok(!urls.some((u) => u.endsWith('/ledger')));
});
