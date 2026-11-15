import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DailyLimitExceededError,
  GEMINI_CHAT_MODEL,
  GEMINI_EMBEDDING_DIMENSIONS,
  GEMINI_EMBEDDING_MODEL,
  LlmProviderError,
  LlmTimeoutError,
  createLlm,
  l2Normalize,
  type ChatMessage,
  type LlmProvider,
} from './llm.ts';

function mockProvider(overrides?: Partial<LlmProvider> & { failTimes?: number }): LlmProvider & {
  completeCalls: number;
  embedCalls: number;
} {
  let failuresLeft = overrides?.failTimes ?? 0;
  const state = {
    completeCalls: 0,
    embedCalls: 0,
  };

  const provider: LlmProvider & typeof state = {
    name: overrides?.name ?? 'mock',
    completeCalls: 0,
    embedCalls: 0,
    async complete(messages, options) {
      state.completeCalls += 1;
      provider.completeCalls = state.completeCalls;
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw new LlmProviderError('transient', { retryable: true, status: 503 });
      }
      if (overrides?.complete) {
        return overrides.complete(messages, options);
      }
      return `echo:${messages.at(-1)?.content ?? ''}`;
    },

    async embed(text) {
      state.embedCalls += 1;
      provider.embedCalls = state.embedCalls;
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw new LlmProviderError('transient', { retryable: true, status: 503 });
      }
      if (overrides?.embed) {
        return overrides.embed(text);
      }
      return [text.length, 1, 0];
    },
  };

  return provider;
}

const messages: ChatMessage[] = [{ role: 'user', content: 'hello' }];

test('complete delegates to the injected provider', async () => {
  const provider = mockProvider();
  const llm = createLlm({ provider, maxRetries: 0 });

  const result = await llm.complete(messages);

  assert.equal(result, 'echo:hello');
  assert.equal(provider.completeCalls, 1);
  assert.equal(llm.providerName, 'mock');
});

test('embed caches by content hash and skips provider on hit', async () => {
  const provider = mockProvider();
  const llm = createLlm({ provider, maxRetries: 0 });

  const first = await llm.embed('same text', { userId: 'u1' });
  const second = await llm.embed('same text', { userId: 'u1' });

  assert.deepEqual(first, [9, 1, 0]);
  assert.deepEqual(second, first);
  assert.equal(provider.embedCalls, 1);
  assert.equal(llm.getDailyUsage('u1'), 1);
});

test('different embed texts miss the cache', async () => {
  const provider = mockProvider();
  const llm = createLlm({ provider, maxRetries: 0 });

  await llm.embed('a');
  await llm.embed('b');

  assert.equal(provider.embedCalls, 2);
});

test('retries retryable provider failures then succeeds', async () => {
  const provider = mockProvider({ failTimes: 2 });
  const llm = createLlm({ provider, maxRetries: 2 });

  const result = await llm.complete(messages);

  assert.equal(result, 'echo:hello');
  assert.equal(provider.completeCalls, 3);
});

test('exhausting retries surfaces the provider error', async () => {
  const provider = mockProvider({
    async complete() {
      throw new LlmProviderError('down', { retryable: true, status: 503 });
    },
  });
  const llm = createLlm({ provider, maxRetries: 1 });

  await assert.rejects(
    () => llm.complete(messages),
    (error: unknown) => {
      assert.ok(error instanceof LlmProviderError);
      assert.equal(error.message, 'down');
      return true;
    },
  );
});

test('per-user daily limit blocks further calls', async () => {
  const provider = mockProvider();
  const llm = createLlm({
    provider,
    dailyLimit: 2,
    maxRetries: 0,
    now: () => new Date('2026-11-14T12:00:00.000Z'),
  });

  await llm.complete(messages, { userId: 'alice' });
  await llm.embed('x', { userId: 'alice' });

  await assert.rejects(
    () => llm.complete(messages, { userId: 'alice' }),
    (error: unknown) => {
      assert.ok(error instanceof DailyLimitExceededError);
      assert.equal(error.userId, 'alice');
      assert.equal(error.limit, 2);
      return true;
    },
  );

  // Other users are unaffected.
  await llm.complete(messages, { userId: 'bob' });
  assert.equal(llm.getDailyUsage('alice'), 2);
  assert.equal(llm.getDailyUsage('bob'), 1);
});

test('calls without userId do not consume the daily budget', async () => {
  const provider = mockProvider();
  const llm = createLlm({ provider, dailyLimit: 1, maxRetries: 0 });

  await llm.complete(messages);
  await llm.complete(messages);

  assert.equal(provider.completeCalls, 2);
  assert.equal(llm.getDailyUsage('anyone'), 0);
});

test('timeouts are wrapped as LlmTimeoutError and retried', async () => {
  let attempts = 0;
  const fetchImpl: typeof fetch = async () => {
    attempts += 1;
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  };

  const llm = createLlm({
    provider: 'gemini',
    env: { LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' },
    fetch: fetchImpl,
    maxRetries: 1,
    timeoutMs: 5,
  });

  await assert.rejects(
    () => llm.complete(messages),
    (error: unknown) => {
      assert.ok(error instanceof LlmTimeoutError);
      return true;
    },
  );
  assert.equal(attempts, 2);
});

test('json option is forwarded to the provider', async () => {
  let sawJson: boolean | undefined;
  const provider = mockProvider({
    async complete(_messages, options) {
      sawJson = options?.json;
      return '{"ok":true}';
    },
  });
  const llm = createLlm({ provider, maxRetries: 0 });

  const result = await llm.complete(messages, { json: true });

  assert.equal(result, '{"ok":true}');
  assert.equal(sawJson, true);
});

test('l2Normalize returns a unit vector', () => {
  const normalized = l2Normalize([3, 4]);
  assert.equal(normalized.length, 2);
  assert.ok(Math.abs((normalized[0] ?? 0) - 0.6) < 1e-9);
  assert.ok(Math.abs((normalized[1] ?? 0) - 0.8) < 1e-9);
  assert.deepEqual(l2Normalize([0, 0]), [0, 0]);
});

test('gemini chat uses gemini-3.8-flash generateContent', async () => {
  let seenUrl = '';
  let seenBody: Record<string, unknown> | undefined;

  const fetchImpl: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  };

  const llm = createLlm({
    provider: 'gemini',
    env: { LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' },
    fetch: fetchImpl,
    maxRetries: 0,
  });

  const result = await llm.complete([{ role: 'user', content: 'ping' }]);

  assert.equal(result, 'ok');
  assert.equal(GEMINI_CHAT_MODEL, 'gemini-3.8-flash');
  assert.match(seenUrl, new RegExp(`/v1beta/models/${GEMINI_CHAT_MODEL}:generateContent\\?`));
  assert.ok(!seenUrl.includes('gemini-2.0-flash'));
  assert.deepEqual(seenBody?.contents, [{ role: 'user', parts: [{ text: 'ping' }] }]);
});

test('gemini embed uses gemini-embedding-001 with 768 dims and normalizes', async () => {
  let seenUrl = '';
  let seenBody: Record<string, unknown> | undefined;

  const fetchImpl: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return new Response(JSON.stringify({ embedding: { values: [3, 4, 0] } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const llm = createLlm({
    provider: 'gemini',
    env: { LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' },
    fetch: fetchImpl,
    maxRetries: 0,
  });

  const vector = await llm.embed('hello embeddings');

  assert.match(seenUrl, new RegExp(`/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent\\?`));
  assert.equal(seenBody?.model, `models/${GEMINI_EMBEDDING_MODEL}`);
  assert.equal(seenBody?.outputDimensionality, GEMINI_EMBEDDING_DIMENSIONS);
  assert.deepEqual(seenBody?.content, { parts: [{ text: 'hello embeddings' }] });
  assert.ok(Math.abs((vector[0] ?? 0) - 0.6) < 1e-9);
  assert.ok(Math.abs((vector[1] ?? 0) - 0.8) < 1e-9);
  assert.equal(vector[2], 0);
});

test('groq chat provider remains available as fallback', async () => {
  let seenUrl = '';
  let seenBody: Record<string, unknown> | undefined;

  const fetchImpl: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: 'groq-ok' } }],
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      },
    );
  };

  const llm = createLlm({
    provider: 'groq',
    env: {
      LLM_PROVIDER: 'groq',
      GROQ_API_KEY: 'test-groq-key',
      GEMINI_API_KEY: 'test-gemini-key',
    },
    fetch: fetchImpl,
    maxRetries: 0,
  });

  const result = await llm.complete(messages);

  assert.equal(result, 'groq-ok');
  assert.equal(llm.providerName, 'groq');
  assert.match(seenUrl, /api\.groq\.com\/openai\/v1\/chat\/completions/);
  assert.equal(seenBody?.model, 'llama-3.1-8b-instant');
});
