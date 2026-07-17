/**
 * Web `FaceEmbedder` (task 3.6, ADR-006) — computes a face embedding via
 * `@vladmandic/human`'s `description` (FaceRes) model.
 *
 * Unlike the native embedder (which expects an already-cropped face image,
 * since ML Kit's detection and the TFLite embedding step are two separate
 * libraries), Human's `detect()` call does detection, alignment, and
 * embedding as one integrated pipeline — so `TImage` here is the *whole*
 * captured frame, not a pre-cropped region. Passing a pre-cropped image
 * would actually hurt accuracy, since Human's own internal alignment
 * expects the full face context (surrounding hair/jaw/ears) to work from.
 */
import {
  EMBEDDING_MODEL,
  type FaceEmbedder,
  type FaceEmbeddingResult,
} from '@attendance-app/face-matching';
import { getHuman } from './humanInstance.web';

export type WebFaceImageInput = HTMLCanvasElement | HTMLVideoElement | ImageData;

/** Which model this platform's embeddings come from
 * (architecture-review-2026-07-16.md's F3) — sent alongside every
 * enrollment/verification embedding so the server only ever compares
 * embeddings produced by the same model. */
export const EMBEDDING_MODEL_ID = EMBEDDING_MODEL.HUMAN_FACERES;

/** Exported as `faceEmbedder` (not e.g. `webFaceEmbedder`) — see
 * faceEmbedder.native.ts's matching comment: screens import this via the
 * extensionless `./faceEmbedder` specifier, so both platform files must
 * export the identical name for Metro's per-platform swap to work. */
export const faceEmbedder: FaceEmbedder<WebFaceImageInput> = {
  async computeEmbedding(image: WebFaceImageInput): Promise<FaceEmbeddingResult> {
    const human = await getHuman();
    const result = await human.detect(image);
    const face = result.face[0];
    if (!face?.embedding) {
      throw new Error('No face detected for embedding computation.');
    }

    return { embedding: face.embedding, detectionConfidence: face.score };
  },
};
