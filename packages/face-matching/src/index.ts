/** Public entry point for @attendance-app/face-matching — see ADR-006/ADR-007. */

export { cosineSimilarity, isMatch, MATCH_THRESHOLD } from './matchEmbedding.js';
export type {
  EmbeddingModelId,
  FaceEmbedder,
  FaceEmbedding,
  FaceEmbeddingResult,
  MatchResult,
} from './types.js';
export { EMBEDDING_MODEL } from './types.js';
