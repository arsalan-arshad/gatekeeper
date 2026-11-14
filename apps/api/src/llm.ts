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

export type LlmProviderName = 'gemini' | 'groq' | 'xai';

/** Minimal swappable backend — inject a mock in unit tests. */
export type LlmProvider = {
  readonly name: LlmProviderName | string;
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

  constructor(
    message: string,
    options?: { status?: number; retryable?: boolean; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'LlmProviderError';
    this.status = options?.status;
    this.retryable = options?.retryable ?? false;
  }
}

export type CreateLlmOptions = {
  provider?: LlmProvider | LlmProviderName;
  /** Max LLM calls per user per UTC day. Default 50. */
  dailyLimit?: number;
  /** Per-request timeout in ms. Default 30_000. */
  timeoutMs?: number;
  /** Retries after the first attempt. Default 2 (3 tries total). */
  maxRetries?: number;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: () => Date;
};

export type Llm = {
  complete(messages: ChatMessage[], options?: CompleteOptions): Promise<string>;
  embed(text: string, options?: EmbedOptions): Promise<number[]>;
  clearEmbeddingCache(): void;
  getDailyUsage(userId: string): number;
  readonly providerName: string;
};

const DEFAULT_DAILY_LIMIT = 50;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;

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
  const retryable = response.status === 429 || response.status >= 500;
  throw new LlmProviderError(
    `${provider} request failed (${response.status}): ${body || response.statusText}`,
    { status: response.status, retryable },
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

function createGeminiProvider(
  apiKey: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): LlmProvider {
  const base = 'https://generativelanguage.googleapis.com/v1beta/models';

  return {
    name: 'gemini',
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
        `${base}/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
        timeoutMs,
      );
      const raw = await response.text();
      assertOk(response, raw, 'gemini');

      const json = JSON.parse(raw) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text =
        json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
      if (!text) {
        throw new LlmProviderError('gemini returned an empty completion', { retryable: true });
      }
      return text;
    },
    async embed(text) {
      const response = await fetchWithTimeout(
        fetchImpl,
        `${base}/text-embedding-004:embedContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'models/text-embedding-004',
            content: { parts: [{ text }] },
          }),
        },
        timeoutMs,
      );
      const raw = await response.text();
      assertOk(response, raw, 'gemini');

      const json = JSON.parse(raw) as { embedding?: { values?: number[] } };
      const values = json.embedding?.values;
      if (!values?.length) {
        throw new LlmProviderError('gemini returned an empty embedding', { retryable: true });
      }
      return values;
    },
  };
}

function createOpenAiCompatibleProvider(options: {
  name: LlmProviderName;
  apiKey: string;
  baseUrl: string;
  model: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  embedProvider: LlmProvider;
}): LlmProvider {
  const { name, apiKey, baseUrl, model, fetchImpl, timeoutMs, embedProvider } = options;

  return {
    name,
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
      assertOk(response, raw, name);

      const parsed = JSON.parse(raw) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const text = parsed.choices?.[0]?.message?.content ?? '';
      if (!text) {
        throw new LlmProviderError(`${name} returned an empty completion`, { retryable: true });
      }
      return text;
    },
    embed(text) {
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

function resolveProviderName(env: NodeJS.ProcessEnv, override?: LlmProviderName): LlmProviderName {
  const raw = (override ?? env.LLM_PROVIDER ?? 'gemini').trim().toLowerCase();
  if (raw === 'gemini' || raw === 'groq' || raw === 'xai') {
    return raw;
  }
  throw new LlmProviderError(`Unsupported LLM_PROVIDER "${raw}". Use gemini | groq | xai.`);
}

function createProviderFromEnv(
  name: LlmProviderName,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): LlmProvider {
  const geminiKey = env.GEMINI_API_KEY?.trim();

  const geminiEmbedFallback = (): LlmProvider => {
    if (!geminiKey) {
      throw new LlmProviderError(
        `${name} chat is configured, but embeddings require GEMINI_API_KEY (Gemini text-embedding-004).`,
      );
    }
    return createGeminiProvider(geminiKey, fetchImpl, timeoutMs);
  };

  if (name === 'gemini') {
    return createGeminiProvider(requireEnv(env, 'GEMINI_API_KEY'), fetchImpl, timeoutMs);
  }

  if (name === 'groq') {
    return createOpenAiCompatibleProvider({
      name: 'groq',
      apiKey: requireEnv(env, 'GROQ_API_KEY'),
      baseUrl: 'https://api.groq.com/openai/v1',
      model: env.GROQ_MODEL?.trim() || 'llama-3.1-8b-instant',
      fetchImpl,
      timeoutMs,
      embedProvider: geminiEmbedFallback(),
    });
  }

  return createOpenAiCompatibleProvider({
    name: 'xai',
    apiKey: requireEnv(env, 'XAI_API_KEY'),
    baseUrl: 'https://api.x.ai/v1',
    model: env.XAI_MODEL?.trim() || 'grok-2-latest',
    fetchImpl,
    timeoutMs,
    embedProvider: geminiEmbedFallback(),
  });
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

/**
 * Build an LLM client. Pass a mock `provider` in tests; production uses `LLM_PROVIDER`.
 */
export function createLlm(options: CreateLlmOptions = {}): Llm {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());
  const dailyLimit = options.dailyLimit ?? Number(env.LLM_DAILY_LIMIT ?? DEFAULT_DAILY_LIMIT);
  const timeoutMs = options.timeoutMs ?? Number(env.LLM_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const maxRetries = options.maxRetries ?? Number(env.LLM_MAX_RETRIES ?? DEFAULT_MAX_RETRIES);

  const provider: LlmProvider =
    options.provider && typeof options.provider === 'object'
      ? options.provider
      : createProviderFromEnv(
          resolveProviderName(env, options.provider as LlmProviderName | undefined),
          env,
          fetchImpl,
          timeoutMs,
        );

  const usage: UsageStore = new Map();
  const embeddingCache = new Map<string, number[]>();

  return {
    providerName: provider.name,

    async complete(messages, completeOptions = {}) {
      consumeDailyBudget(usage, completeOptions.userId, dailyLimit, now);
      return withRetries(
        () => provider.complete(messages, { json: completeOptions.json }),
        maxRetries,
      );
    },

    async embed(text, embedOptions = {}) {
      const hash = contentHash(text);
      const cached = embeddingCache.get(hash);
      if (cached) {
        return cached;
      }

      consumeDailyBudget(usage, embedOptions.userId, dailyLimit, now);
      const vector = await withRetries(() => provider.embed(text), maxRetries);
      embeddingCache.set(hash, vector);
      return vector;
    },

    clearEmbeddingCache() {
      embeddingCache.clear();
    },

    getDailyUsage(userId) {
      return usage.get(usageKey(userId, utcDayKey(now()))) ?? 0;
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
