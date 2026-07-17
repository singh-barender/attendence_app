/**
 * Eye-openness proxy for web (task 3.7, ADR-018) — Android gets a genuine
 * ML Kit eye-open probability classifier for free; @vladmandic/human's
 * face mesh has no equivalent output, only raw eyelid contour landmark
 * points, so this derives a comparable 0-1 value from them instead.
 *
 * Uses the combined upper+lower eyelid contour's bounding-box height/width
 * ratio (a simplified relative of the classic Eye Aspect Ratio) rather
 * than picking specific point pairs for the standard 6-point dlib-style
 * EAR formula — MediaPipe's contour point counts for upper (7 points) vs
 * lower (9 points) don't line up 1:1 for that. Pure/platform-agnostic
 * (plain coordinate arrays in, no Human/DOM dependency) so it's testable
 * without a browser.
 *
 * OPEN_EYE_RATIO/CLOSED_EYE_RATIO are a reasoned placeholder — like
 * MATCH_THRESHOLD and HEAD_TURN_MIN_DEGREES elsewhere in this project,
 * they map onto the *existing* shared `detectBlink` thresholds
 * (packages/liveness's EYE_OPEN_PROBABILITY/EYE_CLOSED_PROBABILITY,
 * calibrated for ML Kit's 0-1 probability scale) rather than introducing
 * a second, web-only threshold — but need empirical tuning against real
 * webcam capture data before being treated as final (no real browser
 * session available to calibrate against yet).
 */

/** A 2D point (or 3D with an ignored z) — matches @vladmandic/human's `Point` shape structurally. */
export type EyeContourPoint = readonly [number, number, ...number[]];

/** A bounding-box height/width ratio at/above this counts as a fully open eye. */
export const OPEN_EYE_RATIO = 0.5;
/** A bounding-box height/width ratio at/below this counts as a fully closed eye. */
export const CLOSED_EYE_RATIO = 0.15;

/**
 * Maps an eye's combined upper+lower eyelid contour points to a 0-1
 * "openness" value comparable to ML Kit's `leftEyeOpenProbability`/
 * `rightEyeOpenProbability`, so the exact same shared `detectBlink`
 * thresholds work unmodified regardless of platform. Returns `null` when
 * there aren't enough points to form a bounding box, or the contour is
 * degenerate (zero width).
 */
export function computeEyeOpenProbability(
  contourPoints: readonly EyeContourPoint[],
): number | null {
  if (contourPoints.length < 2) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of contourPoints) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 0) {
    return null;
  }

  const ratio = height / width;
  if (ratio >= OPEN_EYE_RATIO) {
    return 1;
  }
  if (ratio <= CLOSED_EYE_RATIO) {
    return 0;
  }
  return (ratio - CLOSED_EYE_RATIO) / (OPEN_EYE_RATIO - CLOSED_EYE_RATIO);
}
