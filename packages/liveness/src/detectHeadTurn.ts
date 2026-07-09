/**
 * Head-turn-challenge decision logic (ADR-018) — shared across Android (ML
 * Kit yawAngle) and web (@vladmandic/human face-mesh-derived yaw), pure
 * TypeScript only.
 */

import type { HeadTurnDetectionResult, HeadTurnDirection, LivenessSample } from './types.js';

/**
 * Minimum yaw deviation from the challenge's baseline angle, in degrees, to
 * count as a deliberate head turn rather than natural head jitter while
 * holding still.
 */
export const HEAD_TURN_MIN_DEGREES = 15;

/**
 * Detects a deliberate head turn — a yaw deviation from the challenge's
 * baseline (the first sample with a reported yaw) that exceeds
 * HEAD_TURN_MIN_DEGREES in either direction. The baseline is taken from
 * whichever sample first reports a yaw, not necessarily the first sample in
 * the window, since early frames may not have a detected face yet.
 */
export function detectHeadTurn(samples: readonly LivenessSample[]): HeadTurnDetectionResult {
  let baseline: number | null = null;
  let maxDeviation = 0;
  let direction: HeadTurnDirection | null = null;

  for (const sample of samples) {
    const { yawAngleDegrees } = sample;
    if (yawAngleDegrees === null) {
      continue;
    }
    if (baseline === null) {
      baseline = yawAngleDegrees;
      continue;
    }

    const deviation = yawAngleDegrees - baseline;
    if (Math.abs(deviation) > Math.abs(maxDeviation)) {
      maxDeviation = deviation;
      direction = deviation > 0 ? 'right' : 'left';
    }
  }

  const detected = Math.abs(maxDeviation) >= HEAD_TURN_MIN_DEGREES;
  return { detected, direction: detected ? direction : null };
}
