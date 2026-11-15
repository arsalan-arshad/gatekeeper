/** Enable pgvector before creating embedding columns. */
export const PGVECTOR_EXTENSION_SQL = 'CREATE EXTENSION IF NOT EXISTS vector;';

/** Gemini gemini-embedding-001 output size (via outputDimensionality). */
export const DEFAULT_EMBEDDING_DIMENSIONS = 768;
