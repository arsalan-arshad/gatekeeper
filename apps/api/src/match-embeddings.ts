import { buildOffersEmbeddingText, buildWantsEmbeddingText } from './interview.js';
import { createLlm } from './llm.js';

export type MatchEmbeddingFields = {
  wantsText?: string | null;
  offersText?: string | null;
  bio?: string | null;
  directoryRole?: string | null;
  directoryTags?: string[] | null;
};

/**
 * Best-effort wants/offers embeddings. On failure, returns previous values unchanged.
 */
export async function computeMatchEmbeddings(input: {
  userId: string;
  fields: MatchEmbeddingFields;
  previousWants?: number[] | null;
  previousOffers?: number[] | null;
}): Promise<{
  wantsEmbedding: number[] | null;
  offersEmbedding: number[] | null;
  matchEmbeddingsAt: Date | null;
}> {
  let wantsEmbedding = input.previousWants ?? null;
  let offersEmbedding = input.previousOffers ?? null;
  let updated = false;

  try {
    const llm = createLlm({ maxRetries: 1 });
    const wantsText = buildWantsEmbeddingText(input.fields);
    const offersText = buildOffersEmbeddingText(input.fields);
    if (wantsText.trim()) {
      wantsEmbedding = await llm.embed(wantsText, { userId: input.userId });
      updated = true;
    }
    if (offersText.trim()) {
      offersEmbedding = await llm.embed(offersText, { userId: input.userId });
      updated = true;
    }
  } catch {
    /* keep previous */
  }

  return {
    wantsEmbedding,
    offersEmbedding,
    matchEmbeddingsAt: updated ? new Date() : null,
  };
}
