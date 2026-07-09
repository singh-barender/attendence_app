/**
 * Native (Android) liveness-signal extraction (task 2.6, ADR-018) — converts
 * ML Kit `Face` detections (from the same `useFaceDetector` pipeline used
 * for enrollment, task 2.2) into the shared `LivenessSample` shape consumed
 * by `packages/liveness`'s pure `detectBlink`/`detectHeadTurn`, and manages
 * the rolling sample window for a single challenge attempt. Web's
 * equivalent (`livenessSignals.web.ts`, task 3.7) extracts the same shape
 * from @vladmandic/human's face-mesh landmarks — only the extraction
 * differs, per ADR-018; the decision logic in packages/liveness is shared.
 */

import type {
  LivenessChallengeResult,
  LivenessChallengeType,
  LivenessSample,
} from '@attendance-app/liveness';
import { detectBlink, detectHeadTurn } from '@attendance-app/liveness';
import { useCallback, useRef, useState } from 'react';
import type { Face } from 'react-native-vision-camera-face-detector';

/**
 * How far back samples are retained for a single challenge attempt. Bounds
 * memory/compute per frame and stops a challenge that's been left running
 * from accumulating an unbounded history — not meant to double as the
 * challenge's own pass/fail timeout, which is a UI-level concern
 * (LivenessChallengeOverlay decides how long to wait before giving up).
 */
export const LIVENESS_SAMPLE_WINDOW_MS = 10_000;

/** The not-yet-detected result shape for a given challenge type, before any frames arrive. */
function initialResultFor(type: LivenessChallengeType): LivenessChallengeResult {
  return type === 'blink' ? { detected: false } : { detected: false, direction: null };
}

/** Converts one frame's ML Kit detection into the shared LivenessSample shape. */
export function faceToLivenessSample(face: Face | undefined, timestampMs: number): LivenessSample {
  return {
    timestampMs,
    leftEyeOpenProbability: face?.leftEyeOpenProbability ?? null,
    rightEyeOpenProbability: face?.rightEyeOpenProbability ?? null,
    yawAngleDegrees: face?.yawAngle ?? null,
  };
}

/**
 * Collects a rolling window of per-frame samples for a single liveness
 * challenge attempt and judges completion via packages/liveness's shared
 * decision functions. Kept as a plain class (not a hook) so its windowing
 * and decision logic is unit-testable without a React test renderer — see
 * livenessSignals.native.test.ts. `useLivenessChallenge` below is the thin
 * React wrapper screens actually use.
 */
export class LivenessChallengeSession {
  private samples: LivenessSample[] = [];

  constructor(
    private readonly type: LivenessChallengeType,
    private readonly windowMs: number = LIVENESS_SAMPLE_WINDOW_MS,
  ) {}

  /** Records one frame's face detection, dropping samples older than the retention window. */
  addFrame(face: Face | undefined, timestampMs: number): void {
    this.samples.push(faceToLivenessSample(face, timestampMs));
    const cutoff = timestampMs - this.windowMs;
    this.samples = this.samples.filter((sample) => sample.timestampMs >= cutoff);
  }

  /** Judges whether the challenge has been completed by the samples collected so far. */
  getResult(): LivenessChallengeResult {
    return this.type === 'blink' ? detectBlink(this.samples) : detectHeadTurn(this.samples);
  }

  reset(): void {
    this.samples = [];
  }
}

/**
 * React wrapper around LivenessChallengeSession — the actual camera/frame
 * worklet (owned by whichever screen embeds the liveness challenge, e.g.
 * LoginPunchInScreen, task 2.9) calls `recordFrame` per detected face; the
 * screen renders LivenessChallengeOverlay driven by `result`.
 */
export function useLivenessChallenge(type: LivenessChallengeType) {
  const sessionRef = useRef(new LivenessChallengeSession(type));
  const [result, setResult] = useState<LivenessChallengeResult>(() => initialResultFor(type));

  const recordFrame = useCallback((face: Face | undefined, timestampMs: number) => {
    sessionRef.current.addFrame(face, timestampMs);
    setResult(sessionRef.current.getResult());
  }, []);

  const reset = useCallback(() => {
    sessionRef.current = new LivenessChallengeSession(type);
    setResult(initialResultFor(type));
  }, [type]);

  return { recordFrame, reset, result };
}
