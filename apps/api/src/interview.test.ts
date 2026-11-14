import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  INTERVIEW_QUESTIONS,
  buildProfileEmbeddingText,
  synthesizeProfile,
  synthesizeProfileFromAnswers,
} from './interview.ts';
import type { Llm } from './llm.ts';

const sampleAnswers = {
  who: "I'm Ada, an indie SaaS founder building billing tools.",
  want: 'Warm intros to early-stage B2B founders.',
  never: 'Crypto, NFTs, or generic agency pitches.',
  dealbreakers: 'Cold spam and asking me to promote strangers.',
  format: 'Short email with context, ask, and a clear CTA.',
};

test('interview has exactly five questions', () => {
  assert.equal(INTERVIEW_QUESTIONS.length, 5);
});

test('fallback synthesis builds editable plain-English rules', () => {
  const profile = synthesizeProfileFromAnswers(sampleAnswers);
  assert.match(profile.ruleText, /Warm intros/);
  assert.match(profile.ruleText, /Crypto/);
  assert.ok(profile.handleSuggestion.length >= 2);
});

test('synthesizeProfile uses LLM JSON when available', async () => {
  const llm = {
    providerName: 'mock',
    async complete() {
      return JSON.stringify({
        name: 'Ada',
        bio: 'Indie founder',
        wantsText: 'Founders',
        offersText: 'Billing advice',
        neverText: 'Crypto',
        ruleText: 'Only relevant founder intros.',
        handleSuggestion: 'ada-founder',
      });
    },
    async embed() {
      return [0.1];
    },
    clearEmbeddingCache() {},
    getDailyUsage() {
      return 0;
    },
  } satisfies Llm;

  const profile = await synthesizeProfile(sampleAnswers, llm);
  assert.equal(profile.name, 'Ada');
  assert.equal(profile.handleSuggestion, 'ada-founder');
});

test('synthesizeProfile falls back when LLM fails', async () => {
  const llm = {
    providerName: 'mock',
    async complete() {
      throw new Error('boom');
    },
    async embed() {
      return [];
    },
    clearEmbeddingCache() {},
    getDailyUsage() {
      return 0;
    },
  } satisfies Llm;

  const profile = await synthesizeProfile(sampleAnswers, llm);
  assert.match(profile.ruleText, /Preferred intro format/);
});

test('embedding text includes rules without leaking extra structure', () => {
  const text = buildProfileEmbeddingText({
    name: 'Ada',
    bio: 'Founder',
    ruleText: 'Accept founder intros.',
  });
  assert.match(text, /Ada/);
  assert.match(text, /Accept founder intros/);
});
