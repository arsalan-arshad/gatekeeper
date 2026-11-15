/** Max JSON body size accepted by the API (64 KiB). */
export const BODY_LIMIT_BYTES = 64 * 1024;

/** Max intro message length (characters) — keep in sync with Zod schemas. Never truncate to LLM. */
export const MESSAGE_MAX_CHARS = 2000;

/** Max sender / display name length. */
export const NAME_MAX_CHARS = 100;

/** Fastify content-length / bodyLimit ceiling. */
export const FASTIFY_BODY_LIMIT = BODY_LIMIT_BYTES;
