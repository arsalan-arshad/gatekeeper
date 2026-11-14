import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTableName } from 'drizzle-orm';

import { DEFAULT_EMBEDDING_DIMENSIONS, PGVECTOR_EXTENSION_SQL } from './pgvector.ts';
import { healthChecks } from './schema.ts';

test('placeholder health_checks table is defined', () => {
  assert.equal(getTableName(healthChecks), 'health_checks');
});

test('pgvector scaffolding exports extension SQL', () => {
  assert.match(PGVECTOR_EXTENSION_SQL, /CREATE EXTENSION IF NOT EXISTS vector/);
  assert.equal(DEFAULT_EMBEDDING_DIMENSIONS, 768);
});
