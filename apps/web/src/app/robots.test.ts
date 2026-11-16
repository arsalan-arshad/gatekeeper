import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BRAND } from '../lib/brand.ts';
import robots from './robots.ts';

test('robots allows public paths and disallows dashboard/auth/u', () => {
  const result = robots();
  const rule = Array.isArray(result.rules) ? result.rules[0] : result.rules;
  assert.ok(rule);
  assert.equal(rule.userAgent, '*');
  assert.equal(rule.allow, '/');
  const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
  for (const path of ['/dashboard', '/dashboard/', '/e2e', '/e2e/', '/api/', '/start/check-email', '/u/']) {
    assert.ok(disallow.includes(path), `expected disallow ${path}`);
  }
  assert.equal(result.sitemap, `${BRAND.siteUrl}/sitemap.xml`);
});
