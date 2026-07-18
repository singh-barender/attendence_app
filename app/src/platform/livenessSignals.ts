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
import { detectBlink, detectHeadTurn, detectNod, detectSmile } from '@attendance-app/liveness';
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
    smileProbability: face.smileProbability,
    pitchAngleDegrees: face.pitchAngle,
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
    switch (this.type) {
      case 'blink':
        return detectBlink(this.samples, 1);
      case 'blink-twice':
        return detectBlink(this.samples, 2);
      case 'smile':
        return detectSmile(this.samples);
      case 'nod':
        return detectNod(this.samples);
      case 'head-turn':
        return detectHeadTurn(this.samples);
    }
  }

  reset(): void {
    this.samples = [];
  }

  /** The current sample window, for the caller to send alongside the punch
   * mutation so the server can independently re-judge the same challenge
   * (architecture-review-2026-07-16.md's F1) rather than trusting this
   * class's own client-side `detected` boolean. A copy, not the live array —
   * callers must not be able to mutate this session's internal state.
   *
   * Timestamps are re-based to be relative to this window's first sample
   * (not the raw epoch ms `addFrame` was called with) — `LivenessSampleInput
   * .timestampMs` is a GraphQL `Int` (32-bit signed, max ~2.1 billion), while
   * `Date.now()` epoch-ms values (~1.78 trillion as of 2026) are always far
   * outside that range. Sending the raw epoch value made every real
   * `punchInFace` call fail GraphQL variable-coercion validation before the
   * resolver ever ran (found live: repeated "couldn't confirm it's you"
   * failures traced to a silent "Graphql validation error" in the backend
   * log, not an actual liveness/match rejection). `detectBlink` and the other
   * `packages/liveness` detectors only ever compare samples' timestamps
   * *relative to each other* (see their own tests, which already use small
   * numbers like 0/100/200) — re-basing here loses no information they need,
   * since `addFrame`'s own windowing above still runs on the original raw
   * timestamps internally. */
  getSamples(): readonly LivenessSample[] {
    const firstTimestampMs = this.samples[0]?.timestampMs ?? 0;
    return this.samples.map((sample) => ({
      ...sample,
      timestampMs: sample.timestampMs - firstTimestampMs,
    }));
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

  const getSamples = useCallback(() => sessionRef.current.getSamples(), []);

  return { recordFrame, reset, result, getSamples };
}
