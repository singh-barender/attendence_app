import type { LivenessSample, SmileDetectionResult } from './types.js';

/** Smile-probability at/above this counts as "smiling". */
export const SMILE_PROBABILITY_THRESHOLD = 0.6;
/** Smile-probability at/below this counts as "neutral" (not smiling). */
export const NEUTRAL_PROBABILITY_THRESHOLD = 0.3;

/**
 * Detects a deliberate smile — a neutral expression that then breaks into a
 * smile within the window. Requiring the neutral→smiling *transition* (not
 * just a single high-probability frame) is what makes this a liveness signal
 * rather than something a static photo of a smiling person would trivially
 * pass: a still image never presents the initial not-smiling frame.
 */
export function detectSmile(samples: readonly LivenessSample[]): SmileDetectionResult {
  let sawNeutral = false;

  for (const sample of samples) {
    const probability = sample.smileProbability;
    if (probability === null) {
      continue;
    }

    if (!sawNeutral) {
      if (probability <= NEUTRAL_PROBABILITY_THRESHOLD) {
        sawNeutral = true;
      }
      continue;
    }

    if (probability >= SMILE_PROBABILITY_THRESHOLD) {
      return { detected: true };
    }
  }

  return { detected: false };
}
