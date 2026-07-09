/**
 * Blink-challenge decision logic (ADR-018) — shared across Android (ML Kit)
 * and web (@vladmandic/human via Eye Aspect Ratio), pure TypeScript only.
 */

import type { BlinkDetectionResult, LivenessSample } from './types.js';

/**
 * Eye-open probability at/above this counts as "open"; at/below
 * EYE_CLOSED_PROBABILITY counts as "closed". The gap between the two
 * thresholds is deliberate hysteresis — without it, detector noise
 * hovering near a single mid-range cutoff could register as a spurious
 * open/closed transition on its own.
 */
export const EYE_OPEN_PROBABILITY = 0.6;
export const EYE_CLOSED_PROBABILITY = 0.3;

/**
 * Averages left/right eye-open probability for a sample, falling back to
 * whichever eye is non-null if only one was reported (e.g. a profile angle
 * where one eye is occluded), or null if neither was.
 */
function averageEyeOpenProbability(sample: LivenessSample): number | null {
  const { leftEyeOpenProbability, rightEyeOpenProbability } = sample;
  if (leftEyeOpenProbability === null && rightEyeOpenProbability === null) {
    return null;
  }
  if (leftEyeOpenProbability === null) {
    return rightEyeOpenProbability;
  }
  if (rightEyeOpenProbability === null) {
    return leftEyeOpenProbability;
  }
  return (leftEyeOpenProbability + rightEyeOpenProbability) / 2;
}

/**
 * Detects a completed blink — eyes open, then closed, then open again —
 * within a challenge's sample window. All three phases must occur in
 * temporal order: starting the window already closed proves nothing about
 * liveness (a photo could simply show closed eyes), and a close that never
 * recovers isn't a completed blink.
 */
export function detectBlink(samples: readonly LivenessSample[]): BlinkDetectionResult {
  let sawOpenBeforeClose = false;
  let sawClosedAfterOpen = false;

  for (const sample of samples) {
    const probability = averageEyeOpenProbability(sample);
    if (probability === null) {
      continue;
    }

    if (!sawOpenBeforeClose) {
      if (probability >= EYE_OPEN_PROBABILITY) {
        sawOpenBeforeClose = true;
      }
      continue;
    }

    if (!sawClosedAfterOpen) {
      if (probability <= EYE_CLOSED_PROBABILITY) {
        sawClosedAfterOpen = true;
      }
      continue;
    }

    if (probability >= EYE_OPEN_PROBABILITY) {
      return { detected: true };
    }
  }

  return { detected: false };
}
