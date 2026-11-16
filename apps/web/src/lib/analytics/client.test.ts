import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import {
  __resetAnalyticsStateForTests,
  captureEvent,
  isAnalyticsEnabled,
} from './client.ts';

afterEach(() => {
  delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
  __resetAnalyticsStateForTests();
});

test('analytics is a no-op without a PostHog key', () => {
  process.env.NEXT_PUBLIC_POSTHOG_KEY = '';
  __resetAnalyticsStateForTests();
  assert.equal(isAnalyticsEnabled(), false);
  assert.doesNotThrow(() => {
    captureEvent('demo_started', { surface: 'landing', email: 'should-not-throw@x.com' });
  });
});

test('analytics stays disabled when key is whitespace', () => {
  process.env.NEXT_PUBLIC_POSTHOG_KEY = '   ';
  __resetAnalyticsStateForTests();
  assert.equal(isAnalyticsEnabled(), false);
});
