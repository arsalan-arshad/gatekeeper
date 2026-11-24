import { cosineSimilarity } from './judge.js';
import {
  DIRECTORY_EXCLUDED_HANDLES,
  isDirectoryExcludedEmail,
  toDirectoryPublicEntry,
  type DirectoryPublicEntry,
  type DirectoryUserRow,
} from './directory.js';

export type MatchCandidate = DirectoryUserRow & {
  wantsEmbedding: number[] | null;
  offersEmbedding: number[] | null;
};

export type RankedMatch = {
  user: DirectoryPublicEntry;
  similarity: number;
  scoreBand: 'strong' | 'good';
  matchId: null;
};

export type ExclusionSets = {
  /** User ids already linked by intro_matches in either direction (any status). */
  matchedUserIds: Set<string>;
  /** Dismissals in either direction. */
  dismissedUserIds: Set<string>;
  /** Users already connected via requests (sender email ↔ target). */
  priorRequestUserIds: Set<string>;
  /** Spam-blocked pairs (decision or owner_decision = spam). */
  spamBlockedUserIds: Set<string>;
};

export function matchMinSimilarity(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MATCH_MIN_SIMILARITY?.trim();
  if (!raw) return 0.55;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0.55;
}

/**
 * Symmetric mutual fit:
 * 0.5 * ((1 - wantsA↔offersB) + (1 - wantsB↔offersA))
 * When vectors are L2-normalized, cosine distance ≈ 1 - cosine similarity.
 */
export function mutualFitSimilarity(
  a: { wantsEmbedding: number[] | null; offersEmbedding: number[] | null },
  b: { wantsEmbedding: number[] | null; offersEmbedding: number[] | null },
): number | null {
  if (!a.wantsEmbedding || !a.offersEmbedding || !b.wantsEmbedding || !b.offersEmbedding) {
    return null;
  }
  const aWantsBOffers = cosineSimilarity(a.wantsEmbedding, b.offersEmbedding);
  const bWantsAOffers = cosineSimilarity(b.wantsEmbedding, a.offersEmbedding);
  return 0.5 * (aWantsBOffers + bWantsAOffers);
}

export function scoreBandFromSimilarity(similarity: number): 'strong' | 'good' {
  return similarity >= 0.7 ? 'strong' : 'good';
}

export function isEligibleMatchCandidate(
  candidate: MatchCandidate,
  viewerId: string,
  exclusions: ExclusionSets,
): boolean {
  if (!candidate.directoryOptIn) return false;
  if (candidate.id === viewerId) return false;
  if ((DIRECTORY_EXCLUDED_HANDLES as readonly string[]).includes(candidate.handle.toLowerCase())) {
    return false;
  }
  if (isDirectoryExcludedEmail(candidate.email)) return false;
  if (!candidate.wantsEmbedding || !candidate.offersEmbedding) return false;
  if (exclusions.matchedUserIds.has(candidate.id)) return false;
  if (exclusions.dismissedUserIds.has(candidate.id)) return false;
  if (exclusions.priorRequestUserIds.has(candidate.id)) return false;
  if (exclusions.spamBlockedUserIds.has(candidate.id)) return false;
  return true;
}

export function rankMatchesForViewer(input: {
  viewer: MatchCandidate;
  candidates: MatchCandidate[];
  exclusions: ExclusionSets;
  minSimilarity?: number;
  limit?: number;
}): RankedMatch[] {
  const min = input.minSimilarity ?? matchMinSimilarity();
  const limit = input.limit ?? 5;
  if (!input.viewer.directoryOptIn) return [];
  if (!input.viewer.wantsEmbedding || !input.viewer.offersEmbedding) return [];

  const ranked: Array<RankedMatch & { similarity: number }> = [];
  for (const candidate of input.candidates) {
    if (!isEligibleMatchCandidate(candidate, input.viewer.id, input.exclusions)) continue;
    const similarity = mutualFitSimilarity(input.viewer, candidate);
    if (similarity == null || similarity < min) continue;
    ranked.push({
      user: toDirectoryPublicEntry(candidate),
      similarity,
      scoreBand: scoreBandFromSimilarity(similarity),
      matchId: null,
    });
  }

  ranked.sort((a, b) => b.similarity - a.similarity);
  return ranked.slice(0, limit).map(({ user, scoreBand, matchId, similarity }) => ({
    user,
    scoreBand,
    matchId,
    similarity,
  }));
}

/** Memory store for unit tests. */
let memoryMatchesEnabled = false;
let memoryCandidates: MatchCandidate[] = [];
let memoryExclusions = new Map<string, ExclusionSets>();

export function useMemoryMatchingForTests(enabled = true): void {
  memoryMatchesEnabled = enabled;
  memoryCandidates = [];
  memoryExclusions = new Map();
}

export function resetMemoryMatchingForTests(): void {
  memoryCandidates = [];
  memoryExclusions = new Map();
}

export function seedMemoryMatchCandidateForTests(row: MatchCandidate): void {
  memoryMatchesEnabled = true;
  memoryCandidates = memoryCandidates.filter((c) => c.id !== row.id);
  memoryCandidates.push(row);
}

export function seedMemoryExclusionsForTests(viewerId: string, exclusions: ExclusionSets): void {
  memoryMatchesEnabled = true;
  memoryExclusions.set(viewerId, exclusions);
}

export function isMemoryMatchingEnabledForTests(): boolean {
  return memoryMatchesEnabled;
}

export function findMemoryMatchCandidateByEmail(email: string): MatchCandidate | null {
  if (!memoryMatchesEnabled) return null;
  const normalized = email.trim().toLowerCase();
  return memoryCandidates.find((c) => c.email.toLowerCase() === normalized) ?? null;
}

export function findMemoryMatchCandidateByHandle(handle: string): MatchCandidate | null {
  if (!memoryMatchesEnabled) return null;
  const normalized = handle.trim().toLowerCase();
  return memoryCandidates.find((c) => c.handle.toLowerCase() === normalized) ?? null;
}

export function getMemoryExclusionsForTests(viewerId: string): ExclusionSets {
  return memoryExclusions.get(viewerId) ?? emptyExclusions();
}

export function emptyExclusions(): ExclusionSets {
  return {
    matchedUserIds: new Set(),
    dismissedUserIds: new Set(),
    priorRequestUserIds: new Set(),
    spamBlockedUserIds: new Set(),
  };
}

export function listMemoryMatchesForViewer(viewerId: string): {
  optedIn: boolean;
  matches: RankedMatch[];
} {
  if (!memoryMatchesEnabled) {
    return { optedIn: false, matches: [] };
  }
  const viewer = memoryCandidates.find((c) => c.id === viewerId);
  if (!viewer) return { optedIn: false, matches: [] };
  if (!viewer.directoryOptIn) return { optedIn: false, matches: [] };
  const exclusions = memoryExclusions.get(viewerId) ?? emptyExclusions();
  const matches = rankMatchesForViewer({
    viewer,
    candidates: memoryCandidates,
    exclusions,
  });
  return { optedIn: true, matches };
}
