/**
 * Shared type contracts for liveness-challenge decision logic (ADR-018).
 * Platform-specific signal extraction (ML Kit on Android, @vladmandic/human
 * on web) both produce this same sample shape; only the pure decision
 * functions in this package (detectBlink/detectHeadTurn) judge whether a
 * challenge was completed — see ADR-018's "shared decision, platform-specific
 * extraction" split, mirroring packages/face-matching's own zero-platform-
 * import rule.
 */

/** One frame's worth of liveness-relevant signal, sampled during a challenge window. */
export interface LivenessSample {
  /** Milliseconds since the challenge started (not wall-clock time). */
  readonly timestampMs: number;
  /** Eye-open probability in [0, 1] — null if the detector didn't report one for this frame. */
  readonly leftEyeOpenProbability: number | null;
  readonly rightEyeOpenProbability: number | null;
  /** Head yaw (left/right rotation) in degrees — null if undetected this frame. */
  readonly yawAngleDegrees: number | null;
}

/** Outcome of judging a blink challenge against a sample window. */
export interface BlinkDetectionResult {
  readonly detected: boolean;
}

/**
 * Relative to the challenge's own baseline sample, not a fixed camera-facing
 * convention — task 2.6 maps this to user-facing "turn left"/"turn right"
 * prompts using the detector's actual yaw sign convention.
 */
export type HeadTurnDirection = 'left' | 'right';

/** Outcome of judging a head-turn challenge against a sample window. */
export interface HeadTurnDetectionResult {
  readonly detected: boolean;
  /** Direction of the largest deviation from baseline, or null if not detected. */
  readonly direction: HeadTurnDirection | null;
}
