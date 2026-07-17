/**
 * Shared type contracts for face embedding computation and matching.
 * Platform-specific embedder implementations (Android TFLite, web Human.js)
 * and the backend's re-verification step all conform to these types so the
 * matching logic in matchEmbedding.ts runs identically everywhere — see
 * ADR-006/ADR-007.
 */

/** A single face embedding vector, as produced by a FaceEmbedder. */
export type FaceEmbedding = readonly number[];

/**
 * Which model produced a given embedding (architecture-review-2026-07-16
 * .md's F3) — Android's MobileFaceNet and web's Human FaceRes are
 * independently-trained models with incompatible embedding spaces (ADR-006
 * documents this as a deliberate, honest "real code duplication at the
 * ML-runtime boundary", but the consequence — that the two models'
 * embeddings can't be compared — was never propagated into the data model
 * or matching logic until now). Every stored/live embedding is tagged with
 * this so matching only ever compares like with like, tagged, checked
 * embeddings, never silently assumes any two embeddings share a space
 * regardless of what produced them.
 */
export const EMBEDDING_MODEL = {
  MOBILEFACENET_128: 'MOBILEFACENET_128',
  HUMAN_FACERES: 'HUMAN_FACERES',
} as const;
export type EmbeddingModelId = (typeof EMBEDDING_MODEL)[keyof typeof EMBEDDING_MODEL];

/** Result of running face detection + embedding on a captured frame/image. */
export interface FaceEmbeddingResult {
  readonly embedding: FaceEmbedding;
  /** Detector's own confidence that a face was found (0-1) — not a match score. */
  readonly detectionConfidence: number;
}

/**
 * Computes a face embedding from a captured image. Implemented separately per
 * platform (native TFLite vs. web Human.js) behind this one interface — see
 * ADR-006. `TImage` is generic because the native/web capture representations
 * differ (e.g. a vision-camera Frame vs. an HTMLVideoElement/ImageData on
 * web); each platform implementation fixes this to its own concrete type.
 */
export interface FaceEmbedder<TImage> {
  computeEmbedding(image: TImage): Promise<FaceEmbeddingResult>;
}

/** Outcome of comparing a live embedding against a user's enrolled embeddings. */
export interface MatchResult {
  readonly matched: boolean;
  /** Highest cosine similarity found across all enrolled embeddings compared. */
  readonly bestScore: number;
}
