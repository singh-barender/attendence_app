/**
 * Fixture-based tests for smile-challenge decision logic. Like blink, this is
 * a liveness signal, so the security-relevant property under test is that a
 * *static* smiling image (no neutral→smiling transition) does NOT pass.
 */

import { describe, expect, it } from 'vitest';
import {
  detectSmile,
  NEUTRAL_PROBABILITY_THRESHOLD,
  SMILE_PROBABILITY_THRESHOLD,
} from './detectSmile.js';
import type { LivenessSample } from './types.js';

function sample(timestampMs: number, smileProbability: number | null): LivenessSample {
  return {
    timestampMs,
    leftEyeOpenProbability: null,
    rightEyeOpenProbability: null,
    yawAngleDegrees: null,
    smileProbability,
    pitchAngleDegrees: null,
  };
}

describe('detectSmile', () => {
  it('detects a neutral -> smiling transition', () => {
    const samples = [
      sample(0, NEUTRAL_PROBABILITY_THRESHOLD - 0.1),
      sample(1, 0.5),
      sample(2, SMILE_PROBABILITY_THRESHOLD + 0.1),
    ];
    expect(detectSmile(samples).detected).toBe(true);
  });

  it('rejects an always-smiling window (a static smiling photo)', () => {
    const samples = [
      sample(0, SMILE_PROBABILITY_THRESHOLD + 0.2),
      sample(1, SMILE_PROBABILITY_THRESHOLD + 0.2),
      sample(2, SMILE_PROBABILITY_THRESHOLD + 0.2),
    ];
    expect(detectSmile(samples).detected).toBe(false);
  });

  it('rejects a window that never reaches the smile threshold', () => {
    const samples = [sample(0, 0.1), sample(1, 0.2), sample(2, 0.5)];
    expect(detectSmile(samples).detected).toBe(false);
  });

  it('ignores frames with no reported smile probability', () => {
    const samples = [sample(0, null), sample(1, null)];
    expect(detectSmile(samples).detected).toBe(false);
  });
});
