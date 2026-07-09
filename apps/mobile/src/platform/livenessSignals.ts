/**
 * Liveness-challenge signal collection (task 2.6/3.7, ADR-018) — converts
 * per-frame face detections into the shared `LivenessSample` shape
 * `packages/liveness`'s pure `detectBlink`/`detectHeadTurn` consume, and
 * manages the rolling sample window for a single challenge attempt.
 *
 * This used to be two nearly-identical platform-specific files
 * (livenessSignals.native.ts wrapping ML Kit's `Face`, livenessSignals.web.ts
 * wrapping @vladmandic/human's `FaceResult`) — but since task 3.8 extracted
 * `faceCamera.native.tsx`/`faceCamera.web.tsx`, both platforms already
 * normalize their raw detection into the same neutral `LiveFaceInfo` shape
 * (platform/faceCameraTypes.ts) before this code ever sees it. With no
 * platform-specific type left to wrap, this collapsed into one shared file —
 * the ADR-018 "shared decision, platform-specific extraction" split now
 * lives entirely inside faceCamera.*.tsx instead of being duplicated here
 * too.
 */
import type {
  LivenessChallengeResult,
  LivenessChallengeType,
  LivenessSample,
} from '@attendance-app/liveness';
import { detectBlink, detectHeadTurn } from '@attendance-app/liveness';
import { useCallback, useRef, useState } from 'react';
import type { LiveFaceInfo } from './faceCameraTypes';

/** Bounds memory/compute per frame — not this challenge's pass/fail
 * timeout, which is a UI-level concern owned by the screen. */
export const LIVENESS_SAMPLE_WINDOW_MS = 10_000;

function initialResultFor(type: LivenessChallengeType): LivenessChallengeResult {
  return type === 'blink' ? { detected: false } : { detected: false, direction: null };
}

/** Converts one frame's neutral face info into the shared LivenessSample
 * shape — `LiveFaceInfo`'s eye/yaw fields are already null whenever
 * `hasFace` is false, so no extra branching is needed here. */
export function faceToLivenessSample(face: LiveFaceInfo, timestampMs: number): LivenessSample {
  return {
    timestampMs,
    leftEyeOpenProbability: face.leftEyeOpen,
    rightEyeOpenProbability: face.rightEyeOpen,
    yawAngleDegrees: face.yawAngle,
  };
}

/**
 * Collects a rolling window of per-frame samples for a single liveness
 * challenge attempt and judges completion via packages/liveness's shared
 * decision functions. Kept as a plain class (not a hook) so its windowing
 * and decision logic is unit-testable without a React test renderer —
 * `useLivenessChallenge` below is the thin React wrapper screens use.
 */
export class LivenessChallengeSession {
  private samples: LivenessSample[] = [];

  constructor(
    private readonly type: LivenessChallengeType,
    private readonly windowMs: number = LIVENESS_SAMPLE_WINDOW_MS,
  ) {}

  /** Records one frame's face detection, dropping samples older than the retention window. */
  addFrame(face: LiveFaceInfo, timestampMs: number): void {
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
 * React wrapper around LivenessChallengeSession — the camera abstraction
 * (faceCamera.native.tsx/faceCamera.web.tsx, owned by whichever screen
 * embeds the liveness challenge, e.g. LoginPunchInScreen) calls
 * `recordFrame` per detected frame; the screen renders
 * LivenessChallengeOverlay driven by `result`.
 */
export function useLivenessChallenge(type: LivenessChallengeType) {
  const sessionRef = useRef(new LivenessChallengeSession(type));
  const [result, setResult] = useState<LivenessChallengeResult>(() => initialResultFor(type));

  const recordFrame = useCallback((face: LiveFaceInfo, timestampMs: number) => {
    sessionRef.current.addFrame(face, timestampMs);
    setResult(sessionRef.current.getResult());
  }, []);

  const reset = useCallback(() => {
    sessionRef.current = new LivenessChallengeSession(type);
    setResult(initialResultFor(type));
  }, [type]);

  return { recordFrame, reset, result };
}
