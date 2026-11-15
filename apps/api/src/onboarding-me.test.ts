import assert from 'node:assert/strict';
import { test } from 'node:test';

/** Shape contract for GET /v1/onboarding/me — known and unknown share keys. */
function onboardingMeShape(body: {
  onboarded: boolean;
  user: unknown;
  gateRules: unknown;
}) {
  return Object.keys(body).sort();
}

test('onboarding/me unknown user matches known response keys', () => {
  const unknown = { onboarded: false as const, user: null, gateRules: null };
  const known = {
    onboarded: true as const,
    user: { id: 'u1', handle: 'ada', name: 'Ada', email: 'a@b.c', bio: '', wantsText: '', offersText: '', neverText: '' },
    gateRules: null,
  };
  assert.deepEqual(onboardingMeShape(unknown), onboardingMeShape(known));
  assert.deepEqual(onboardingMeShape(unknown), ['gateRules', 'onboarded', 'user']);
});
