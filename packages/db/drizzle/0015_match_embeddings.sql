-- Separate wants/offers vectors for mutual-fit matching.
-- Do not embed never_text or private ruleText here.
-- HNSW (vector_cosine_ops) on wants_embedding/offers_embedding can be added later when volume warrants it.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "wants_embedding" vector(768);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "offers_embedding" vector(768);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "match_embeddings_at" timestamp with time zone;
