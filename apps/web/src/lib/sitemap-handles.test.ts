import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isExcludedTestOrJunkHandle,
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

test('excludes e2e*, test*-gk, and explicit junk handles from sitemap', () => {
  const updatedAt = new Date('2024-06-15T12:00:00.000Z');

  assert.equal(isExcludedTestOrJunkHandle('e2ehzyrvm'), true);
  assert.equal(isExcludedTestOrJunkHandle('e2eti1ypaz'), true);
  assert.equal(isExcludedTestOrJunkHandle('e2eti467dz'), true);
  assert.equal(isExcludedTestOrJunkHandle('e2ei46bsg'), true);
  assert.equal(isExcludedTestOrJunkHandle('E2EExtra'), true);
  assert.equal(isExcludedTestOrJunkHandle('testfounder-gk'), true);
  assert.equal(isExcludedTestOrJunkHandle('testuser2-gk'), true);
  assert.equal(isExcludedTestOrJunkHandle('test-anything-gk'), true);
  assert.equal(isExcludedTestOrJunkHandle('arsalan-a-software-engin'), true);
  assert.equal(isExcludedTestOrJunkHandle('Arsalan-A-Software-Engin'), true);

  // Real / kept handles
  assert.equal(isExcludedTestOrJunkHandle('demo'), false);
  assert.equal(isExcludedTestOrJunkHandle('arsalandev'), false);
  assert.equal(isExcludedTestOrJunkHandle('alice'), false);
  // Does not match test*-gk (no -gk suffix)
  assert.equal(isExcludedTestOrJunkHandle('testfounder'), false);

  for (const handle of [
    'e2ehzyrvm',
    'e2eti1ypaz',
    'e2eti467dz',
    'e2ei46bsg',
    'testfounder-gk',
    'testuser2-gk',
    'arsalan-a-software-engin',
  ]) {
    assert.equal(
      shouldIncludeHandleInSitemap({ handle, updatedAt, published: true }),
      false,
      `expected ${handle} excluded`,
    );
  }

  assert.equal(
    shouldIncludeHandleInSitemap({ handle: 'arsalandev', updatedAt, published: true }),
    true,
  );
  assert.equal(shouldIncludeHandleInSitemap({ handle: 'demo', updatedAt }), true);

  const entries = publishedHandleSitemapEntries(
    [
      { handle: 'arsalandev', updatedAt },
      { handle: 'arsalan-a-software-engin', updatedAt },
      { handle: 'e2ehzyrvm', updatedAt },
      { handle: 'testfounder-gk', updatedAt },
      { handle: 'testuser2-gk', updatedAt },
      { handle: 'demo', updatedAt },
    ],
    'https://gatekeeper.example',
  );
  assert.deepEqual(
    entries.map((e) => e.url),
    ['https://gatekeeper.example/@arsalandev', 'https://gatekeeper.example/@demo'],
  );
});
