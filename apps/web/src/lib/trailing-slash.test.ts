import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PUBLIC_TRAILING_SLASH_EXAMPLES,
  shouldPreserveTrailingSlash,
  stripTrailingSlashForRedirect,
} from './trailing-slash.ts';

test('PostHog ingest paths keep trailing slashes', () => {
  assert.equal(shouldPreserveTrailingSlash('/ingest/i/v0/e/'), true);
  assert.equal(shouldPreserveTrailingSlash('/ingest/s/'), true);
  assert.equal(shouldPreserveTrailingSlash('/ingest'), true);
  assert.equal(stripTrailingSlashForRedirect('/ingest/i/v0/e/'), null);
  assert.equal(stripTrailingSlashForRedirect('/ingest/s/'), null);
});

test('public pages still strip trailing slashes', () => {
  for (const { from, to } of PUBLIC_TRAILING_SLASH_EXAMPLES) {
    assert.equal(stripTrailingSlashForRedirect(from), to);
  }
  assert.equal(stripTrailingSlashForRedirect('/start'), null);
  assert.equal(stripTrailingSlashForRedirect('/'), null);
});
