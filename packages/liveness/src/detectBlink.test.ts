/**
 * Fixture-based tests for blink-challenge decision logic — this gates
 * whether a static photo can pass face verification (ADR-018), so it gets
 * the same test attention as face-matching's security-relevant logic.
 */

import { describe, expect, it } from 'vitest';
import { detectBlink, EYE_CLOSED_PROBABILITY, EYE_OPEN_PROBABILITY } from './detectBlink.js';
import type { LivenessSample } from './types.js';

/** Builds a sample with only the eye-probability fields under test set. */
function sample(
  timestampMs: number,
  leftEyeOpenProbability: number | null,
  rightEyeOpenProbability: number | null = leftEyeOpenProbability,
): LivenessSample {
  return {
    timestampMs,
    leftEyeOpenProbability,
    rightEyeOpenProbability,
    yawAngleDegrees: null,
    smileProbability: null,
    pitchAngleDegrees: null,
  };
}

describe('detectBlink', () => {
  it('detects a genuine open -> closed -> open cycle', () => {
    const samples = [
      sample(0, EYE_OPEN_PROBABILITY + 0.1),
      sample(100, EYE_CLOSED_PROBABILITY - 0.1),
      sample(200, EYE_OPEN_PROBABILITY + 0.1),
    ];
    expect(detectBlink(samples).detected).toBe(true);
  });

  it('does not detect when eyes never close', () => {
    const samples = [sample(0, 0.9), sample(100, 0.85), sample(200, 0.95)];
    expect(detectBlink(samples).detected).toBe(false);
  });

  it('does not detect when the window starts already closed (no baseline open)', () => {
    const samples = [
      sample(0, EYE_CLOSED_PROBABILITY - 0.1),
      sample(100, EYE_OPEN_PROBABILITY + 0.1),
    ];
    expect(detectBlink(samples).detected).toBe(false);
  });

  it('does not detect a close that never reopens', () => {
    const samples = [
      sample(0, EYE_OPEN_PROBABILITY + 0.1),
      sample(100, EYE_CLOSED_PROBABILITY - 0.1),
      sample(200, EYE_CLOSED_PROBABILITY - 0.05),
    ];
    expect(detectBlink(samples).detected).toBe(false);
  });

  it('does not detect probabilities that only dip into the hysteresis gap (never fully closed)', () => {
    const midRange = (EYE_OPEN_PROBABILITY + EYE_CLOSED_PROBABILITY) / 2;
    const samples = [
      sample(0, EYE_OPEN_PROBABILITY + 0.1),
      sample(100, midRange),
      sample(200, EYE_OPEN_PROBABILITY + 0.1),
    ];
    expect(detectBlink(samples).detected).toBe(false);
  });

  it('ignores null-probability samples rather than treating them as a phase transition', () => {
    const samples: LivenessSample[] = [
      sample(0, EYE_OPEN_PROBABILITY + 0.1),
      sample(100, null, null),
      sample(200, EYE_CLOSED_PROBABILITY - 0.1),
      sample(300, null, null),
      sample(400, EYE_OPEN_PROBABILITY + 0.1),
    ];
    expect(detectBlink(samples).detected).toBe(true);
  });

  it('falls back to whichever eye is non-null when only one is reported', () => {
    const samples: LivenessSample[] = [
      sample(0, EYE_OPEN_PROBABILITY + 0.1, null),
      sample(100, EYE_CLOSED_PROBABILITY - 0.1, null),
      sample(200, EYE_OPEN_PROBABILITY + 0.1, null),
    ];
    expect(detectBlink(samples).detected).toBe(true);
  });

  it('averages left/right probabilities when both are present', () => {
    // The right eye alone reads above the closed threshold (0.4 > 0.3), but
    // averaged with the left eye's 0.1 still dips into "closed" (0.25) —
    // proving the two are combined rather than only one eye being checked.
    const samples: LivenessSample[] = [
      sample(0, EYE_OPEN_PROBABILITY + 0.1, EYE_OPEN_PROBABILITY + 0.1),
      sample(100, 0.1, 0.4),
      sample(200, EYE_OPEN_PROBABILITY + 0.1, EYE_OPEN_PROBABILITY + 0.1),
    ];
    expect(detectBlink(samples).detected).toBe(true);
  });

  it('returns false for an empty sample window', () => {
    expect(detectBlink([]).detected).toBe(false);
  });
});
