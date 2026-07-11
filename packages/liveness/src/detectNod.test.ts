/**
 * Fixture-based tests for nod-challenge decision logic — a nod is a pitch
 * deviation from the window's baseline beyond NOD_PITCH_DEGREES in either
 * direction.
 */

import { describe, expect, it } from 'vitest';
import { detectNod, NOD_PITCH_DEGREES } from './detectNod.js';
import type { LivenessSample } from './types.js';

function sample(timestampMs: number, pitchAngleDegrees: number | null): LivenessSample {
  return {
    timestampMs,
    leftEyeOpenProbability: null,
    rightEyeOpenProbability: null,
    yawAngleDegrees: null,
    smileProbability: null,
    pitchAngleDegrees,
  };
}

describe('detectNod', () => {
  it('detects a downward pitch deviation past the threshold', () => {
    const samples = [
      sample(0, 0),
      sample(1, NOD_PITCH_DEGREES / 2),
      sample(2, NOD_PITCH_DEGREES + 2),
    ];
    expect(detectNod(samples).detected).toBe(true);
  });

  it('detects an upward pitch deviation past the threshold', () => {
    const samples = [sample(0, 5), sample(1, 5 - (NOD_PITCH_DEGREES + 1))];
    expect(detectNod(samples).detected).toBe(true);
  });

  it('rejects a still head that never pitches enough', () => {
    const samples = [sample(0, 0), sample(1, 2), sample(2, -3), sample(3, 1)];
    expect(detectNod(samples).detected).toBe(false);
  });

  it('returns not-detected when no pitch is ever reported', () => {
    expect(detectNod([sample(0, null), sample(1, null)]).detected).toBe(false);
  });

  it('returns not-detected for an empty window', () => {
    expect(detectNod([]).detected).toBe(false);
  });
});
