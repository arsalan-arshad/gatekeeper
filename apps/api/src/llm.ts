import { createHash } from 'node:crypto';

/** Chat roles accepted by every provider adapter. */
export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type CompleteOptions = {
  /** Ask the model to return JSON (provider-specific hints applied). */
  json?: boolean;
  /** When set, this call counts toward the user's daily LLM budget. */
  userId?: string;
};

export type EmbedOptions = {
  /** When set, a cache miss counts toward the user's daily LLM budget. */
  userId?: string;
};

export type LlmProviderName = 'gemini' | 'groq';

/** Minimal swappable backend — inject a mock in unit tests. */
export type LlmProvider = {
  readonly name: LlmProviderName | string;
  /** Chat model id when known (omitted on test mocks). */
  readonly model?: string;
  complete(messages: ChatMessage[], options?: { json?: boolean }): Promise<string>;
  embed(text: string): Promise<number[]>;
};

export class DailyLimitExceededError extends Error {
  readonly userId: string;
  readonly limit: number;

  constructor(userId: string, limit: number) {
    super(`Daily LLM limit of ${limit} calls exceeded for user ${userId}`);
    this.name = 'DailyLimitExceededError';
    this.userId = userId;
    this.limit = limit;
  }
}

export class LlmTimeoutError extends Error {
  constructor(message = 'LLM request timed out') {
    super(message);
    this.name = 'LlmTimeoutError';
  }
}

export class LlmProviderError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  readonly provider?: string;

  constructor(
    message: string,
    options?: { status?: number; retryable?: boolean; cause?: unknown; provider?: string },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'LlmProviderError';
    this.status = options?.status;
    this.retryable = options?.retryable ?? false;
    this.provider = options?.provider;
  }
}

export class LlmBusyError extends Error {
  constructor(message = 'AI busy, try again') {
    super(message);
    this.name = 'LlmBusyError';
  }
}

export type ProviderHealth = {
  provider: LlmProviderName;
  ok: boolean;
  model: string | null;
  error: string | null;
};

export type CreateLlmOptions = {
  provider?: LlmProvider | LlmProviderName;
  /** Max LLM calls per user per UTC day. Default 50. */
  dailyLimit?: number;
  /** Per-request timeout in ms. Default 8_000. */
  timeoutMs?: number;
  /** Retries after the first attempt (per provider). Default 0 when failover is enabled. */
  maxRetries?: number;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: () => Date;
  /** Optional logger — never receives API keys. */
  log?: (info: { provider: string; status?: number; message: string }) => void;
};

export type Llm = {
  complete(messages: ChatMessage[], options?: CompleteOptions): Promise<string>;
  embed(text: string, options?: EmbedOptions): Promise<number[]>;
  clearEmbeddingCache(): void;
  getDailyUsage(userId: string): number;
  /** Active chat provider name (first available / last successful). */
  readonly providerName: string;
  /** Probe configured providers (no secrets returned). */
  healthCheck(): Promise<ProviderHealth[]>;
};

const DEFAULT_DAILY_LIMIT = 50;
/** Failover budget — providers that exceed this are treated as failed. */
export const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_RETRIES = 0;
const COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Current Google AI Studio free-tier Flash chat model.
 * Verified on https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash
 * Override with `GEMINI_MODEL`.
 */
export const GEMINI_CHAT_MODEL = 'gemini-3.8-flash';

/** Alias used in env docs — same default as {@link GEMINI_CHAT_MODEL}. */
export const DEFAULT_GEMINI_MODEL = GEMINI_CHAT_MODEL;

/** Current Google AI Studio embedding model (text-embedding-004 returns 404 on v1beta). */
export const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';

/** Match packages/db DEFAULT_EMBEDDING_DIMENSIONS / vector(768). */
export const GEMINI_EMBEDDING_DIMENSIONS = 768;

export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';

type UsageStore = Map<string, number>;

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function usageKey(userId: string, day: string): string {
  return `${day}:${userId}`;
}

function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError')
  );
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (isAbortError(error)) {
      throw new LlmTimeoutError();
    }
    throw new LlmProviderError('LLM network request failed', {
      retryable: true,
      cause: error,
    });
  } finally {
    clearTimeout(timer);
  }
}

function shouldRetry(error: unknown): boolean {
  if (error instanceof LlmTimeoutError) return true;
  if (error instanceof LlmProviderError) return error.retryable;
  return false;
}

async function withRetries<T>(run: () => Promise<T>, maxRetries: number): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }
      const backoffMs = 100 * 2 ** attempt + Math.floor(Math.random() * 50);
      await sleep(backoffMs);
    }
  }

  throw lastError;
}

function assertOk(response: Response, body: string, provider: string): void {
  if (response.ok) return;
  const retryable =
    response.status === 429 ||
    response.status >= 500 ||
    /RESOURCE_EXHAUSTED|UNAVAILABLE|high demand/i.test(body);
  throw new LlmProviderError(
    `${provider} request failed (${response.status}): ${body || response.statusText}`,
    { status: response.status, retryable, provider },
  );
}

function toGeminiContents(messages: ChatMessage[]): {
  systemInstruction?: { parts: Array<{ text: string }> };
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
} {
  const systemParts = messages
    .filter((message) => message.role === 'system')
    .map((message) => ({ text: message.content }));

  const contents = messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }));

  return {
    systemInstruction: systemParts.length > 0 ? { parts: systemParts } : undefined,
    contents,
  };
}

/** L2-normalize truncated gemini-embedding-001 vectors (required for non-3072 dims). */
export function l2Normalize(values: number[]): number[] {
  let sumSquares = 0;
  for (const value of values) {
    sumSquares += value * value;
  }
  if (sumSquares === 0) return values;
  const norm = Math.sqrt(sumSquares);
  return values.map((value) => value / norm);
}

function resolveGeminiModel(env: NodeJS.ProcessEnv): string {
  return env.GEMINI_MODEL?.trim() || env.GEMINI_CHAT_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

function resolveGroqModel(env: NodeJS.ProcessEnv): string {
  return env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
}

function createGeminiProvider(
  apiKey: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  chatModel: string,
): LlmProvider {
  const base = 'https://generativelanguage.googleapis.com/v1beta/models';

  return {
    name: 'gemini',
    model: chatModel,
    async complete(messages, options) {
      const { systemInstruction, contents } = toGeminiContents(messages);
      const body: Record<string, unknown> = {
        contents,
        generationConfig: options?.json ? { responseMimeType: 'application/json' } : undefined,
      };
      if (systemInstruction) {
        body.systemInstruction = systemInstruction;
      }

      const response = await fetchWithTimeout(
        fetchImpl,
        `${base}/${chatModel}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
        timeoutMs,
      );
      const raw = await response.text();
      assertOk(response, raw, 'gemini');

      let json: {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        error?: { status?: string; message?: string };
      };
      try {
        json = JSON.parse(raw) as typeof json;
      } catch (error) {
        throw new LlmProviderError('gemini returned invalid JSON envelope', {
          retryable: true,
          provider: 'gemini',
          cause: error,
        });
      }

      if (json.error?.status === 'RESOURCE_EXHAUSTED' || /RESOURCE_EXHAUSTED/i.test(raw)) {
        throw new LlmProviderError(`gemini RESOURCE_EXHAUSTED: ${json.error?.message ?? raw}`, {
          status: 429,
          retryable: true,
          provider: 'gemini',
        });
      }

      const text =
        json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
      if (!text) {
        throw new LlmProviderError('gemini returned an empty completion', {
          retryable: true,
          provider: 'gemini',
        });
      }
      return text;
    },
    async embed(text) {
      const response = await fetchWithTimeout(
        fetchImpl,
        `${base}/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: `models/${GEMINI_EMBEDDING_MODEL}`,
            content: { parts: [{ text }] },
            outputDimensionality: GEMINI_EMBEDDING_DIMENSIONS,
          }),
        },
        timeoutMs,
      );
      const raw = await response.text();
      assertOk(response, raw, 'gemini');

      const json = JSON.parse(raw) as { embedding?: { values?: number[] } };
      const values = json.embedding?.values;
      if (!values?.length) {
        throw new LlmProviderError('gemini returned an empty embedding', {
          retryable: true,
          provider: 'gemini',
        });
      }
      return l2Normalize(values);
    },
  };
}

function createGroqProvider(options: {
  apiKey: string;
  model: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  embedProvider: LlmProvider | null;
}): LlmProvider {
  const { apiKey, model, fetchImpl, timeoutMs, embedProvider } = options;
  const baseUrl = 'https://api.groq.com/openai/v1';

  return {
    name: 'groq',
    model,
    async complete(messages, completeOptions) {
      const openAiMessages = messages.map((message) => ({
        role: message.role,
        content: message.content,
      }));

      if (completeOptions?.json) {
        openAiMessages.unshift({
          role: 'system',
          content: 'Respond with valid JSON only. Do not wrap the JSON in markdown fences.',
        });
      }

      const response = await fetchWithTimeout(
        fetchImpl,
        `${baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: openAiMessages,
            temperature: 0.2,
            ...(completeOptions?.json ? { response_format: { type: 'json_object' } } : {}),
          }),
        },
        timeoutMs,
      );
      const raw = await response.text();
      assertOk(response, raw, 'groq');

      let parsed: {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      try {
        parsed = JSON.parse(raw) as typeof parsed;
      } catch (error) {
        throw new LlmProviderError('groq returned invalid JSON envelope', {
          retryable: true,
          provider: 'groq',
          cause: error,
        });
      }
      const text = parsed.choices?.[0]?.message?.content ?? '';
      if (!text) {
        throw new LlmProviderError('groq returned an empty completion', {
          retryable: true,
          provider: 'groq',
        });
      }
      return text;
    },
    embed(text) {
      if (!embedProvider) {
        throw new LlmProviderError(
          'groq chat is configured, but embeddings require GEMINI_API_KEY',
          { provider: 'groq' },
        );
      }
      return embedProvider.embed(text);
    },
  };
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new LlmProviderError(`Missing required environment variable ${key}`);
  }
  return value;
}

function createSingleProviderFromEnv(
  name: LlmProviderName,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): LlmProvider {
  const geminiKey = env.GEMINI_API_KEY?.trim();
  const geminiModel = resolveGeminiModel(env);
  const geminiEmbed =
    geminiKey !== undefined && geminiKey.length > 0
      ? createGeminiProvider(geminiKey, fetchImpl, timeoutMs, geminiModel)
      : null;

  if (name === 'gemini') {
    return createGeminiProvider(
      requireEnv(env, 'GEMINI_API_KEY'),
      fetchImpl,
      timeoutMs,
      geminiModel,
    );
  }

  return createGroqProvider({
    apiKey: requireEnv(env, 'GROQ_API_KEY'),
    model: resolveGroqModel(env),
    fetchImpl,
    timeoutMs,
    embedProvider: geminiEmbed,
  });
}

/** Build Gemini → Groq chain from whichever API keys are present. */
export function buildProviderChain(
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): LlmProvider[] {
  const chain: LlmProvider[] = [];
  const geminiKey = env.GEMINI_API_KEY?.trim();
  const groqKey = env.GROQ_API_KEY?.trim();
  const geminiModel = resolveGeminiModel(env);

  let gemini: LlmProvider | null = null;
  if (geminiKey) {
    gemini = createGeminiProvider(geminiKey, fetchImpl, timeoutMs, geminiModel);
    chain.push(gemini);
  }

  if (groqKey) {
    chain.push(
      createGroqProvider({
        apiKey: groqKey,
        model: resolveGroqModel(env),
        fetchImpl,
        timeoutMs,
        embedProvider: gemini,
      }),
    );
  }

  return chain;
}

function consumeDailyBudget(
  usage: UsageStore,
  userId: string | undefined,
  limit: number,
  now: () => Date,
): void {
  if (!userId) return;

  const key = usageKey(userId, utcDayKey(now()));
  const current = usage.get(key) ?? 0;
  if (current >= limit) {
    throw new DailyLimitExceededError(userId, limit);
  }
  usage.set(key, current + 1);
}

function looksLikeJsonObject(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/** Whether an error should trigger failover to the next provider. */
export function isFailoverError(error: unknown): boolean {
  if (error instanceof LlmTimeoutError) return true;
  if (!(error instanceof LlmProviderError)) return false;
  if (error.status === 429 || (error.status !== undefined && error.status >= 500)) return true;
  if (/RESOURCE_EXHAUSTED|invalid JSON|empty completion/i.test(error.message)) return true;
  return error.retryable;
}

function defaultLog(info: { provider: string; status?: number; message: string }): void {
  // Never log secrets — callers must scrub keys from `message`.
  console.warn(
    `[llm] provider=${info.provider} status=${info.status ?? 'n/a'} message=${info.message}`,
  );
}

function scrubSecrets(message: string, env: NodeJS.ProcessEnv): string {
  let out = message;
  for (const key of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'ADMIN_TOKEN'] as const) {
    const value = env[key]?.trim();
    if (value && value.length > 4) {
      out = out.split(value).join('[redacted]');
    }
  }
  // Also strip key= query fragments if somehow present.
  out = out.replace(/key=[^&\s"']+/gi, 'key=[redacted]');
  out = out.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]');
  return out;
}

/**
 * Build an LLM client. Pass a mock `provider` in tests; production uses Gemini → Groq failover
 * based on which API keys are set.
 */
export function createLlm(options: CreateLlmOptions = {}): Llm {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  const dailyLimit = options.dailyLimit ?? Number(env.LLM_DAILY_LIMIT ?? DEFAULT_DAILY_LIMIT);
  const timeoutMs = options.timeoutMs ?? Number(env.LLM_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const maxRetries =
    options.maxRetries ??
    (env.LLM_MAX_RETRIES !== undefined ? Number(env.LLM_MAX_RETRIES) : DEFAULT_MAX_RETRIES);
  const log = options.log ?? defaultLog;

  const cooldownUntil = new Map<string, number>();

  let providers: LlmProvider[];
  let activeName: string;

  if (options.provider && typeof options.provider === 'object') {
    providers = [options.provider];
    activeName = options.provider.name;
  } else if (typeof options.provider === 'string') {
    const single = createSingleProviderFromEnv(options.provider, env, fetchImpl, timeoutMs);
    providers = [single];
    activeName = single.name;
  } else {
    providers = buildProviderChain(env, fetchImpl, timeoutMs);
    if (providers.length === 0) {
      throw new LlmProviderError(
        'No LLM providers configured. Set GEMINI_API_KEY and/or GROQ_API_KEY.',
      );
    }
    activeName = providers[0]!.name;
  }

  // Prefer an injected mock, then Gemini, for embeddings.
  const embedProvider: LlmProvider | null =
    options.provider && typeof options.provider === 'object'
      ? options.provider
      : (providers.find((p) => p.name === 'gemini') ??
        (env.GEMINI_API_KEY?.trim()
          ? createGeminiProvider(
              env.GEMINI_API_KEY.trim(),
              fetchImpl,
              timeoutMs,
              resolveGeminiModel(env),
            )
          : null));

  const usage: UsageStore = new Map();
  const embeddingCache = new Map<string, number[]>();

  function markCooldown(providerName: string, error: unknown): void {
    const status = error instanceof LlmProviderError ? error.status : undefined;
    if (
      status === 429 ||
      (error instanceof LlmProviderError && /RESOURCE_EXHAUSTED/i.test(error.message))
    ) {
      cooldownUntil.set(providerName, now().getTime() + COOLDOWN_MS);
    }
  }

  function isCoolingDown(providerName: string): boolean {
    const until = cooldownUntil.get(providerName);
    if (!until) return false;
    if (now().getTime() >= until) {
      cooldownUntil.delete(providerName);
      return false;
    }
    return true;
  }

  async function completeWithFailover(
    messages: ChatMessage[],
    completeOptions: CompleteOptions,
  ): Promise<string> {
    const errors: unknown[] = [];

    for (const provider of providers) {
      if (isCoolingDown(provider.name)) {
        log({
          provider: provider.name,
          message: 'skipped — 429 cooldown active',
        });
        continue;
      }

      try {
        const text = await withRetries(
          () => provider.complete(messages, { json: completeOptions.json }),
          maxRetries,
        );

        if (completeOptions.json && !looksLikeJsonObject(text)) {
          throw new LlmProviderError(`${provider.name} returned invalid JSON`, {
            retryable: true,
            provider: provider.name,
          });
        }

        activeName = provider.name;
        return text;
      } catch (error) {
        const status = error instanceof LlmProviderError ? error.status : undefined;
        const message = scrubSecrets(error instanceof Error ? error.message : String(error), env);
        log({ provider: provider.name, status, message });
        markCooldown(provider.name, error);
        errors.push(error);

        if (!isFailoverError(error)) {
          throw error;
        }
      }
    }

    const last = errors.at(-1);
    if (last instanceof Error) {
      throw new LlmBusyError(`AI busy, try again (${errors.length} provider(s) failed)`);
    }
    throw new LlmBusyError();
  }

  return {
    get providerName() {
      return activeName;
    },

    async complete(messages, completeOptions = {}) {
      consumeDailyBudget(usage, completeOptions.userId, dailyLimit, now);
      return completeWithFailover(messages, completeOptions);
    },

    async embed(text, embedOptions = {}) {
      const hash = contentHash(text);
      const cached = embeddingCache.get(hash);
      if (cached) {
        return cached;
      }

      if (!embedProvider) {
        throw new LlmProviderError('Embeddings require GEMINI_API_KEY', { provider: 'gemini' });
      }

      consumeDailyBudget(usage, embedOptions.userId, dailyLimit, now);
      const vector = await withRetries(() => embedProvider.embed(text), maxRetries);
      embeddingCache.set(hash, vector);
      return vector;
    },

    clearEmbeddingCache() {
      embeddingCache.clear();
    },

    getDailyUsage(userId) {
      return usage.get(usageKey(userId, utcDayKey(now()))) ?? 0;
    },

    async healthCheck(): Promise<ProviderHealth[]> {
      const results: ProviderHealth[] = [];
      const probeMessages: ChatMessage[] = [
        { role: 'user', content: 'Reply with JSON: {"ok":true}' },
      ];

      const names: LlmProviderName[] = ['gemini', 'groq'];
      for (const name of names) {
        const provider = providers.find((p) => p.name === name);
        if (!provider) {
          const keyName = name === 'gemini' ? 'GEMINI_API_KEY' : 'GROQ_API_KEY';
          results.push({
            provider: name,
            ok: false,
            model: null,
            error: `${keyName} not set`,
          });
          continue;
        }

        try {
          const text = await withRetries(() => provider.complete(probeMessages, { json: true }), 0);
          if (!looksLikeJsonObject(text) && !/ok/i.test(text)) {
            results.push({
              provider: name,
              ok: false,
              model: provider.model ?? null,
              error: 'invalid probe response',
            });
          } else {
            results.push({
              provider: name,
              ok: true,
              model: provider.model ?? null,
              error: null,
            });
          }
        } catch (error) {
          results.push({
            provider: name,
            ok: false,
            model: provider.model ?? null,
            error: scrubSecrets(error instanceof Error ? error.message : String(error), env),
          });
        }
      }

      return results;
    },
  };
}

let defaultClient: Llm | undefined;

function getDefaultClient(): Llm {
  if (!defaultClient) {
    defaultClient = createLlm();
  }
  return defaultClient;
}

/** Reset the process-wide client (useful in tests). */
export function resetDefaultLlm(): void {
  defaultClient = undefined;
}

export async function complete(
  messages: ChatMessage[],
  options?: CompleteOptions,
): Promise<string> {
  return getDefaultClient().complete(messages, options);
}

export async function embed(text: string, options?: EmbedOptions): Promise<number[]> {
  return getDefaultClient().embed(text, options);
}
