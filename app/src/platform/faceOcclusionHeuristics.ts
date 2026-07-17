/**
 * Occlusion-detection heuristics for ML Kit's per-frame `Face` landmarks,
 * split out of `faceCamera.native.tsx`'s frame-processor worklet
 * (coding-standards.md's "small, modular, single-responsibility files").
 * Marked `'worklet'` explicitly since it's called from a different file than
 * where it runs (react-native-worklets, ADR-028) — a plain pure function of
 * its argument, with no closure over component state, so it's safe to
 * recreate on the worklet thread.
 *
 * Occlusion requires a broad set of core landmarks to all be present —
 * nose, both mouth corners, at least one eye, and at least one cheek — not
 * just mouth+nose. Only "at least one" (not both) for eye/cheek: a genuine
 * left/right profile shot legitimately loses the *far* eye/cheek, so
 * requiring both would falsely flag every profile and block profile
 * enrollment. ML Kit exposes no landmark for hair or forehead at all (its
 * `Landmarks` type is fixed to eyes/cheeks/ears/mouth/nose — see
 * `react-native-vision-camera-face-detector`'s `Landmarks.nitro.d.ts`) and
 * its two `EAR` landmarks proved too unreliable even on genuine unoccluded
 * frontal shots to require — those two are therefore not, and cannot be,
 * checked here; framing (is a face-sized region roughly centered in the
 * shot at all) is covered separately by `assessEnrollmentQuality`'s
 * existing size/centering checks.
 *
 * Presence alone is still not sufficient by itself: found via live-device
 * testing that a hand spread across the lower face with fingers over the
 * mouth/nose was still ACCEPTED, because ML Kit's landmark model estimates
 * a "best guess" position even when the true feature is hidden — it never
 * reports "absent because occluded," only "absent because out of frame"
 * (e.g. the far side during a profile turn). Mouth/nose geometry adds a
 * second, independent signal for that specific pair: a genuine mouth/nose
 * sits in a normal spatial relationship to the rest of the face; a guessed
 * position under occlusion tends to collapse towards degenerate geometry
 * (mouth not meaningfully below the nose, or its two corners collapsed onto
 * each other).
 *
 * Confirmed via ADR-031: even this combined heuristic proved unable to
 * reliably catch a real hand held steadily over the mouth/nose (ML Kit's
 * face mesh is deliberately robust to partial occlusion) — a dedicated hand
 * detector (`handDetector.native.ts`) was added as the real fix. This
 * heuristic is kept as a cheap, always-on additional signal, not the
 * primary defense.
 */
import type { Face } from 'react-native-vision-camera-face-detector';

/** Minimum nose-to-mouth vertical gap, as a fraction of face bounding-box
 * height, below which the mouth landmark is treated as an implausible
 * (rather than merely absent) estimate. Set conservatively low (a real
 * mouth sits ~15-20% of face height below the nose) so a genuinely
 * compressed profile angle still passes; this only catches a near-total
 * collapse. */
const MIN_NOSE_TO_MOUTH_GAP_RATIO = 0.05;
/** Minimum mouth-corner width, as a fraction of face bounding-box width,
 * below which the mouth corners are treated as collapsed onto each other
 * (an implausible estimate) rather than a genuine narrow/profile mouth. */
const MIN_MOUTH_WIDTH_RATIO = 0.05;

export interface FaceOcclusionResult {
  readonly isOccluded: boolean;
  readonly mouthBottom: { readonly x: number; readonly y: number } | null;
}

export function computeFaceOcclusion(face: Face | undefined): FaceOcclusionResult {
  'worklet';
  if (!face) {
    return { isOccluded: false, mouthBottom: null };
  }
  const mouthBottom = face.landmarks?.MOUTH_BOTTOM;
  const noseBase = face.landmarks?.NOSE_BASE;
  const mouthLeft = face.landmarks?.MOUTH_LEFT;
  const mouthRight = face.landmarks?.MOUTH_RIGHT;
  const leftEye = face.landmarks?.LEFT_EYE;
  const rightEye = face.landmarks?.RIGHT_EYE;
  const leftCheek = face.landmarks?.LEFT_CHEEK;
  const rightCheek = face.landmarks?.RIGHT_CHEEK;

  const hasCoreFaceLandmarks =
    mouthBottom != null &&
    noseBase != null &&
    mouthLeft != null &&
    mouthRight != null &&
    (leftEye != null || rightEye != null) &&
    (leftCheek != null || rightCheek != null);

  const isLowerFaceGeometryImplausible =
    mouthBottom != null && noseBase != null
      ? mouthBottom.y - noseBase.y < face.bounds.height * MIN_NOSE_TO_MOUTH_GAP_RATIO ||
        (mouthLeft != null &&
          mouthRight != null &&
          Math.abs(mouthRight.x - mouthLeft.x) < face.bounds.width * MIN_MOUTH_WIDTH_RATIO)
      : false;

  return {
    isOccluded: !hasCoreFaceLandmarks || isLowerFaceGeometryImplausible,
    mouthBottom: mouthBottom ?? null,
  };
}
