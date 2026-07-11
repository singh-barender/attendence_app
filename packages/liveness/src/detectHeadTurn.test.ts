/**
 * Fixture-based tests for head-turn-challenge decision logic — this gates
 * whether a static photo can pass face verification (ADR-018), so it gets
 * the same test attention as face-matching's security-relevant logic.
 */

import { describe, expect, it } from 'vitest';
import { detectHeadTurn, HEAD_TURN_MIN_DEGREES } from './detectHeadTurn.js';
import type { LivenessSample } from './types.js';

/** Builds a sample with only the yaw field under test set. */
function sample(timestampMs: number, yawAngleDegrees: number | null): LivenessSample {
  return {
    timestampMs,
    leftEyeOpenProbability: null,
    rightEyeOpenProbability: null,
    yawAngleDegrees,
    smileProbability: null,
    pitchAngleDegrees: null,
  };
}

describe('detectHeadTurn', () => {
  it('detects a turn to the right (positive yaw deviation)', () => {
    const samples = [sample(0, 0), sample(100, HEAD_TURN_MIN_DEGREES + 5)];
    const result = detectHeadTurn(samples);
    expect(result.detected).toBe(true);
    expect(result.direction).toBe('right');
  });

  it('detects a turn to the left (negative yaw deviation)', () => {
    const samples = [sample(0, 0), sample(100, -(HEAD_TURN_MIN_DEGREES + 5))];
    const result = detectHeadTurn(samples);
    expect(result.detected).toBe(true);
    expect(result.direction).toBe('left');
  });

  it('does not detect deviation under the threshold (natural jitter)', () => {
    const samples = [sample(0, 0), sample(100, HEAD_TURN_MIN_DEGREES - 5)];
    const result = detectHeadTurn(samples);
    expect(result.detected).toBe(false);
    expect(result.direction).toBeNull();
  });

  it('establishes baseline from the first sample with a reported yaw, skipping leading nulls', () => {
    const samples = [
      sample(0, null),
      sample(50, null),
      sample(100, 10),
      sample(200, 10 + HEAD_TURN_MIN_DEGREES + 5),
    ];
    const result = detectHeadTurn(samples);
    expect(result.detected).toBe(true);
    expect(result.direction).toBe('right');
  });

  it('reports the direction of the largest-magnitude deviation across the window', () => {
    const samples = [
      sample(0, 0),
      sample(100, HEAD_TURN_MIN_DEGREES + 2), // right, smaller
      sample(200, -(HEAD_TURN_MIN_DEGREES + 20)), // left, larger
    ];
    const result = detectHeadTurn(samples);
    expect(result.detected).toBe(true);
    expect(result.direction).toBe('left');
  });

  it('returns not-detected with a null direction when no yaw data is present', () => {
    const samples = [sample(0, null), sample(100, null)];
    const result = detectHeadTurn(samples);
    expect(result.detected).toBe(false);
    expect(result.direction).toBeNull();
  });

  it('returns false for an empty sample window', () => {
    const result = detectHeadTurn([]);
    expect(result.detected).toBe(false);
    expect(result.direction).toBeNull();
  });

  it('is not fooled by a single baseline-only sample (no deviation possible)', () => {
    const result = detectHeadTurn([sample(0, 30)]);
    expect(result.detected).toBe(false);
  });
});
