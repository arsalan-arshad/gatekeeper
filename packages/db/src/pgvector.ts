/** Enable pgvector before creating embedding columns. */
export const PGVECTOR_EXTENSION_SQL = 'CREATE EXTENSION IF NOT EXISTS vector;';

/** Gemini text-embedding-004 output size. */
export const DEFAULT_EMBEDDING_DIMENSIONS = 768;
