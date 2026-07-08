/**
 * Cosine-similarity face-embedding matching. This is the one piece of the
 * face-recognition stack that runs identically on the Android client, the
 * web client, and the backend's re-verification step (ADR-006/ADR-007) —
 * everything here must stay pure TypeScript with no platform-specific
 * imports.
 */

import type { FaceEmbedding, MatchResult } from './types.js';

/**
 * Minimum cosine similarity for a live embedding to be considered a match.
 * Shared by client-side optimistic matching and the server's authoritative
 * re-verification (ADR-007) — both must import this exact constant, never a
 * locally redefined copy, or the two checks can silently drift apart.
 *
 * Placeholder value — per ADR-006/tasks.md Phase 2, this must be tuned
 * empirically against real enrolled/live capture pairs before it's
 * meaningful; not to be treated as final until that tuning happens.
 */
export const MATCH_THRESHOLD = 0.75;

/**
 * Cosine similarity between two embeddings, in [-1, 1]. Cosine similarity,
 * not Euclidean distance, because face embeddings are compared by direction
 * (identity signature), not by magnitude, which can vary with capture
 * conditions even for the same person.
 */
export function cosineSimilarity(a: FaceEmbedding, b: FaceEmbedding): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: embedding length mismatch (${a.length} vs ${b.length})`);
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const valueA = a[i] ?? 0;
    const valueB = b[i] ?? 0;
    dotProduct += valueA * valueB;
    magnitudeA += valueA * valueA;
    magnitudeB += valueB * valueB;
  }

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

/**
 * Compares a live embedding against every enrolled embedding for a user
 * (left/right/frontal, per ADR-006) and returns the best match found.
 * Trying all enrolled embeddings — not just the frontal one — makes
 * matching more tolerant of the live capture angle varying from a single
 * reference shot.
 */
export function isMatch(
  liveEmbedding: FaceEmbedding,
  enrolledEmbeddings: readonly FaceEmbedding[],
  threshold: number = MATCH_THRESHOLD,
): MatchResult {
  if (enrolledEmbeddings.length === 0) {
    return { matched: false, bestScore: 0 };
  }

  const bestScore = Math.max(
    ...enrolledEmbeddings.map((enrolled) => cosineSimilarity(liveEmbedding, enrolled)),
  );

  return { matched: bestScore >= threshold, bestScore };
}
