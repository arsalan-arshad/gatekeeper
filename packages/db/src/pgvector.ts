/**
 * pgvector scaffolding (Step 1).
 * Step 3 will enable the extension and add embedding columns, e.g.:
 *   CREATE EXTENSION IF NOT EXISTS vector;
 *   embedding vector(768)
 */
export const PGVECTOR_EXTENSION_SQL = 'CREATE EXTENSION IF NOT EXISTS vector;';

/** Placeholder dimension for Gemini embedding-001 / text-embedding models. */
export const DEFAULT_EMBEDDING_DIMENSIONS = 768;
