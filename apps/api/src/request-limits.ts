/** Max JSON body size accepted by the API (64 KiB). */
export const BODY_LIMIT_BYTES = 64 * 1024;

/** Max intro message length (characters) — keep in sync with Zod schemas. */
export const MESSAGE_MAX_CHARS = 4000;

/** Fastify content-length / bodyLimit ceiling. */
export const FASTIFY_BODY_LIMIT = BODY_LIMIT_BYTES;
