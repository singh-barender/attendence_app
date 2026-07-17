/**
 * Web counterpart to `faceOcclusionHeuristics.ts` (native) — closes a real
 * gap the face-verification-pipeline-review-2026-07-16.md found: web
 * previously had *zero* occlusion detection of any kind (`isOccluded` was
 * hardcoded `false` unconditionally). This brings web up to the same tier
 * of defense native had before ADR-031's dedicated hand detector was added
 * — not full parity with native's palm-detector model (a genuinely new web
 * ML model/pipeline is a separate, larger follow-up, not attempted blind in
 * an environment with no browser available to verify it live against).
 *
 * Deliberately skips the "landmark presence" half of native's heuristic —
 * Human's face model (`@vladmandic/human`, MediaPipe FaceMesh topology) is
 * a *fixed* 468-point mesh: every named annotation group is always
 * populated for any detected face, so "is this landmark present" is never
 * meaningfully false the way ML Kit's landmark model can report a genuinely
 * missing point. Only the geometry-plausibility check — is the estimated
 * position anatomically sane, not just "is it there" — carries real signal
 * here, which is consistent with (not a departure from) ADR-031's own
 * finding that presence-only checks are insufficient against occlusion.
 */
import type { FaceResult } from '@vladmandic/human';

/** Same reasoning/values as `faceOcclusionHeuristics.ts`'s native constants —
 * a real mouth sits meaningfully below the nose and has real width; a
 * hand/object flattening the lower-face estimate collapses both. */
const MIN_NOSE_TO_MOUTH_GAP_RATIO = 0.05;
const MIN_MOUTH_WIDTH_RATIO = 0.05;

export interface FaceOcclusionResult {
  readonly isOccluded: boolean;
  readonly mouthBottom: { readonly x: number; readonly y: number } | null;
}

type AnnotationPoint = readonly [number, number, ...number[]];

function extremePoint(
  points: readonly AnnotationPoint[] | undefined,
  axis: 0 | 1,
  direction: 'min' | 'max',
): AnnotationPoint | null {
  if (!points || points.length === 0) {
    return null;
  }
  // No explicit initial value (reduce's no-initial-value overload) so the
  // accumulator's type is `AnnotationPoint`, never `| undefined` — indexing
  // `points[0]` directly would widen to `| undefined` under
  // noUncheckedIndexedAccess even though the length check above already
  // guarantees an element exists.
  return points.reduce((best, point) => {
    if (direction === 'max') {
      return point[axis] > best[axis] ? point : best;
    }
    return point[axis] < best[axis] ? point : best;
  });
}

/**
 * Mirrors `faceOcclusionHeuristics.ts`'s `computeFaceOcclusion` — same
 * decision logic (nose-to-mouth vertical gap, mouth-corner width, both
 * normalized against the face's own bounding-box size), adapted to Human's
 * contour-based annotations instead of ML Kit's single named points: the
 * mouth's bottommost/leftmost/rightmost contour points stand in for
 * MOUTH_BOTTOM/MOUTH_LEFT/MOUTH_RIGHT, and `noseBottom` stands in for
 * NOSE_BASE.
 */
export function computeFaceOcclusion(face: FaceResult | undefined): FaceOcclusionResult {
  if (!face) {
    return { isOccluded: false, mouthBottom: null };
  }

  const annotations = face.annotations as Record<string, AnnotationPoint[]>;
  const mouthContour = annotations.mouth;
  const noseBottom = annotations.noseBottom?.[0] ?? null;

  const mouthBottomPoint = extremePoint(mouthContour, 1, 'max');
  const mouthLeftPoint = extremePoint(mouthContour, 0, 'min');
  const mouthRightPoint = extremePoint(mouthContour, 0, 'max');

  if (!mouthBottomPoint || !noseBottom || !mouthLeftPoint || !mouthRightPoint) {
    // Fails CLOSED, not open: Human's face mesh is a fixed 468-point
    // topology that always populates every annotation group for any
    // detected face (this file's header comment), so a detected face
    // (`hasFace: true`) with an unmappable mouth/nose contour is not the
    // ordinary case — it's a signal something is wrong, not a benign gap
    // to wave through. This result feeds `assessEnrollmentQuality`'s
    // accept/reject decision directly (via the last live-frame tick, since
    // capture() has no separate re-detection step on web unlike native's
    // capturedPhotoFaceDetection.native.ts), so defaulting to "not
    // occluded" here was a real fail-open path a follow-up review caught.
    // The cost of the reverse default is a rare, retry-able false rejection
    // on a genuine transient miss; the cost of the old default was a
    // heavily-occluded face (e.g. a mask covering nose/mouth) being able to
    // reach this branch and pass unchecked.
    return { isOccluded: true, mouthBottom: null };
  }

  const [, , faceWidth, faceHeight] = face.box;
  const noseToMouthGap = mouthBottomPoint[1] - noseBottom[1];
  const mouthWidth = mouthRightPoint[0] - mouthLeftPoint[0];

  const isLowerFaceGeometryImplausible =
    noseToMouthGap < faceHeight * MIN_NOSE_TO_MOUTH_GAP_RATIO ||
    mouthWidth < faceWidth * MIN_MOUTH_WIDTH_RATIO;

  return {
    isOccluded: isLowerFaceGeometryImplausible,
    mouthBottom: { x: mouthBottomPoint[0], y: mouthBottomPoint[1] },
  };
}
