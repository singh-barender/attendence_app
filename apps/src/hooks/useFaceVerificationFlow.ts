/**
 * Face-verification capture/liveness/punch flow, split out of
 * `LoginPunchInScreen` (coding-standards.md's "small, modular,
 * single-responsibility files") — the camera stays mounted and driving this
 * hook's state for as long as `isFaceCameraActive` is true; the screen only
 * renders what this hook computes.
 *
 * Task 2.9 adds the real face path (fingerprint has been real since Phase
 * 1): tapping "Verify Face" starts the camera, drives a liveness challenge
 * (`useLivenessChallenge('blink')`, task 2.6), and only once a blink is
 * detected does it capture + compute a live embedding.
 *
 * There is deliberately **no local match** against the user's enrolled
 * embeddings here — `identify` only ever returns booleans
 * (`faceEnrolled`/`fingerprintEnrolled`), never raw embedding vectors, since
 * exposing enrolled biometric data to any caller who knows a valid email
 * (pre-verification) would be a real exposure. The "optimistic" part of
 * architecture.md's "local embedding -> local optimistic match" is UX
 * framing only: an immediate "Verifying..." state right after the live
 * embedding is computed, while `punchInFace`'s server-side re-verification
 * (ADR-007 — the actual security boundary, task 2.9/2.11) is what actually
 * decides success or failure — and, since architecture-review-2026-07-16
 * .md's F1, that re-verification now covers liveness too, not just the
 * embedding match: the actual sample window `liveness.getSamples()` used to
 * judge this attempt's challenge is sent alongside the embedding, so the
 * server can independently confirm the same open→closed→open (or other
 * challenge) transition happened, rather than trusting this hook's own
 * `detected` boolean.
 *
 * Task 2.10 adds retry/fallback UX: every failure (challenge timeout,
 * losing sight of the face mid-capture, or a server-rejected match) bumps
 * `faceFailureCount`; once it reaches `FACE_FALLBACK_THRESHOLD` the caller
 * shows either a "Use Fingerprint Instead" button (if this account/device
 * supports it) or more specific lighting/positioning guidance — never both,
 * and only after repeated failures, so a single ordinary retry isn't
 * treated as if something's badly wrong.
 */
import type { LivenessChallengeType } from '@attendance-app/liveness';
import * as Haptics from 'expo-haptics';
import type { ComponentRef } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LivenessChallengeType as GqlLivenessChallengeType } from '../generated/graphql';
import { usePunchInFaceMutation } from '../generated/graphql';
import { type FaceCameraView, useFaceCameraPermission } from '../platform/faceCamera';
import { FRAME_STATE_THROTTLE_MS, type LiveFaceInfo } from '../platform/faceCameraTypes';
import { EMBEDDING_MODEL_ID, faceEmbedder } from '../platform/faceEmbedder';
import { useLivenessChallenge } from '../platform/livenessSignals';
import { getErrorMessage } from '../services/graphqlError';
import { assessEnrollmentQuality } from '../utils/enrollmentQuality';
import { ANGLE_INFO } from '../utils/faceAngles';
import { getPunchLocation } from '../utils/geolocation';
import { generateIdempotencyKey } from '../utils/idempotencyKey';
import { assessLiveAlignment } from '../utils/liveFaceAlignment';

/** How long the camera waits for a completed blink before giving up. */
export const FACE_CHALLENGE_TIMEOUT_MS = 15_000;

/**
 * Liveness challenges verification randomizes over. Deliberately only the
 * blink family: both require a real open→closed→open eye transition, so a
 * static photo can't satisfy them (a single-frame smile-probability check
 * could), AND both leave the face frontal for the capture that fires the
 * instant the challenge passes — head-turn/nod would end with the head
 * turned/pitched, which both strands the user (the frontal frame gate filters
 * out the very turned frames those detectors need) and yields a poor
 * off-angle capture. `blink-twice` adds variety an observer can't predict.
 * Wiring the motion challenges in needs a capture-after-challenge flow rework
 * plus on-device verification — tracked as a follow-up, not used here yet.
 */
const VERIFICATION_CHALLENGES: readonly LivenessChallengeType[] = ['blink', 'blink-twice'];

/** Maps this app's internal challenge-type strings (shared with
 * `packages/liveness`, which can't use hyphen-free GraphQL enum names) to
 * the GraphQL enum the server actually expects — see
 * `backend/src/graphql/types/liveness.ts` for the server-side
 * mapping back. */
const CHALLENGE_TYPE_TO_GRAPHQL: Record<LivenessChallengeType, GqlLivenessChallengeType> = {
  blink: 'BLINK',
  'blink-twice': 'BLINK_TWICE',
  'head-turn': 'HEAD_TURN',
  smile: 'SMILE',
  nod: 'NOD',
};

/** Failed face attempts (timeout, lost-face, or server rejection) before
 * offering the fingerprint fallback / extra guidance (ADR-018). */
export const FACE_FALLBACK_THRESHOLD = 2;

export function useFaceVerificationFlow(
  userId: string | null | undefined,
  onPunchSuccess: () => void,
) {
  const [isFaceCameraActive, setIsFaceCameraActive] = useState(false);
  const [faceAttemptId, setFaceAttemptId] = useState(0);
  const [faceError, setFaceError] = useState<string | null>(null);
  const [isFaceTimedOut, setIsFaceTimedOut] = useState(false);
  const [isProcessingFace, setIsProcessingFace] = useState(false);
  const [faceFailureCount, setFaceFailureCount] = useState(0);
  /** Whether the *most recent* frame had a properly-framed, frontal-facing
   * face (user-requested, ADR-018-safe: reuses the exact same
   * `assessLiveAlignment` size/centering/yaw signal `FaceEnrollmentCapture`
   * already uses, no new ML). Drives both the oval guide's color and, more
   * importantly, gates which frames are allowed to count toward the blink
   * challenge below — without this gate, a face barely visible at the edge
   * of frame (only an eye showing) could still satisfy `detectBlink`, which
   * looks purely at eye-open-probability transitions with no framing check
   * of its own. */
  const [isFaceAligned, setIsFaceAligned] = useState(false);
  const [cameraLayoutSize, setCameraLayoutSize] = useState({ width: 0, height: 0 });
  const lastAlignmentUpdateRef = useRef(0);
  const faceCaptureTriggeredRef = useRef(false);
  const cameraRef = useRef<ComponentRef<typeof FaceCameraView>>(null);

  const {
    hasPermission: hasCameraPermission,
    requestPermission: requestCameraPermission,
    hasDevice,
  } = useFaceCameraPermission();
  const [challengeType, setChallengeType] = useState<LivenessChallengeType>('blink');

  const randomizeChallenge = useCallback(() => {
    setChallengeType(
      VERIFICATION_CHALLENGES[Math.floor(Math.random() * VERIFICATION_CHALLENGES.length)] ??
        'blink',
    );
  }, []);

  useEffect(() => {
    randomizeChallenge();
  }, [randomizeChallenge]);

  const liveness = useLivenessChallenge(challengeType);

  const {
    mutate: punchInFace,
    isPending: isPunchingInFace,
    isPaused: isFacePunchPaused,
    isError: isFacePunchError,
    error: facePunchError,
  } = usePunchInFaceMutation({
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onPunchSuccess();
    },
    onError: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // The server rejected the match (or another error) — let the user
      // retry the challenge rather than being stuck on a dead camera view.
      handleFaceFailure();
    },
  });

  /** Resets challenge state to try again, without touching the failure count. */
  function resetFaceChallenge() {
    faceCaptureTriggeredRef.current = false;
    setIsFaceTimedOut(false);
    setFaceError(null);
    setIsProcessingFace(false);
    setIsFaceAligned(false);
    liveness.reset();
    randomizeChallenge();
    setFaceAttemptId((id) => id + 1);
  }

  /** A failed attempt (lost-face mid-capture, or server rejection) — counts
   * toward the fallback threshold, then immediately resets so the camera
   * keeps running and the user can try again without an extra tap.
   * `message` (if given) is applied *after* the reset, since resetFaceChallenge
   * itself clears faceError — setting it before would just be wiped out. */
  function handleFaceFailure(message?: string) {
    setFaceFailureCount((count) => count + 1);
    resetFaceChallenge();
    if (message) {
      setFaceError(message);
    }
  }

  /** The "Try Again" button after a timeout — the failure was already
   * counted when the timeout fired (see the timeout effect below), so this
   * only resets the challenge state, it doesn't count a second failure. */
  function handleRetryAfterTimeout() {
    resetFaceChallenge();
  }

  /** A fresh start (the "Verify Face" button) — the user is starting over,
   * not continuing a failure streak, so the count clears. */
  function handleStartFaceVerification() {
    setFaceFailureCount(0);
    resetFaceChallenge();
    setIsFaceCameraActive(true);
  }

  function handleCancelFaceVerification() {
    setIsFaceCameraActive(false);
    setFaceFailureCount(0);
    resetFaceChallenge();
  }

  /**
   * Called on every detected frame by FaceCameraView. Frames only count
   * toward the blink challenge (`liveness.recordFrame`) while properly
   * aligned — `assessLiveAlignment` is the same presence/size/centering/yaw
   * check `FaceEnrollmentCapture` uses to gate its Capture button, applied
   * here against the frontal-facing range (`ANGLE_INFO.frontal`) since
   * verification, unlike enrollment, only ever asks for one angle. The
   * alignment decision itself is computed fresh on every frame (so a
   * misaligned frame can never sneak into the challenge window); only the
   * `isFaceAligned` *state* that drives the oval's color is throttled, same
   * cadence as enrollment's own debug readout, to avoid a render per frame.
   */
  function handleFrame(info: LiveFaceInfo) {
    const aligned = assessLiveAlignment({
      hasFace: info.hasFace,
      faceCount: info.faceCount,
      faceBounds: info.bounds,
      frameWidth: info.frameWidth,
      frameHeight: info.frameHeight,
      yawAngle: info.yawAngle,
      minYawDegrees: ANGLE_INFO.frontal.minYaw,
      maxYawDegrees: ANGLE_INFO.frontal.maxYaw,
      isOccluded: info.isOccluded,
      leftEyeOpen: info.leftEyeOpen,
      rightEyeOpen: info.rightEyeOpen,
    });
    if (aligned) {
      liveness.recordFrame(info, Date.now());
    }

    // Only the alignment *state* that colors the oval is throttled (a render
    // per frame would be wasteful). `faceError` is deliberately NOT touched
    // here: it's for capture/verification failures (set by handleFaceFailure,
    // cleared on retry), kept separate from live guidance. Occlusion, a
    // misframe, closed eyes, or a second face all make `aligned` false, which
    // reddens the oval and shows the "align your face" hint on its own — no
    // per-frame error text needed.
    const now = Date.now();
    if (now - lastAlignmentUpdateRef.current >= FRAME_STATE_THROTTLE_MS) {
      lastAlignmentUpdateRef.current = now;
      setIsFaceAligned(aligned);
    }
  }

  /**
   * Captures + submits only once the frame at the moment of capture also
   * passes the same quality bar enrollment requires (`assessEnrollmentQuality`
   * — presence, exposure, focus, framing, eyes, occlusion — evaluated
   * entirely against the just-captured photo itself, not any preceding live
   * preview frame; see face-verification-pipeline-review-2026-07-16.md for
   * why that distinction is the actual fix here, not a nicety). The
   * alignment gate above already keeps obviously-bad frames out of the blink
   * window, but a user can still drift out of frame — or blink again — in
   * the instant between the blink completing and this capture actually
   * running; this is the last-moment check that closes that gap rather than
   * trusting the blink alone to mean "this was a good capture".
   */
  async function handleFaceCapture() {
    if (!userId) {
      return;
    }
    setIsProcessingFace(true);
    setFaceError(null);

    try {
      const captured = await cameraRef.current?.capture();
      if (!captured) {
        handleFaceFailure('We lost sight of your face — try again.');
        return;
      }

      const quality = assessEnrollmentQuality({
        hasFace: captured.hasFace,
        faceCount: captured.faceCount,
        faceBounds: captured.faceBounds,
        frameWidth: captured.frameWidth,
        frameHeight: captured.frameHeight,
        averageBrightness: captured.averageBrightness,
        sharpnessScore: captured.sharpnessScore,
        leftEyeOpen: captured.leftEyeOpen,
        rightEyeOpen: captured.rightEyeOpen,
        isOccluded: captured.isOccluded,
        mouthRegionSharpnessRatio: captured.mouthRegionSharpnessRatio,
        handDetected: captured.handDetected,
      });
      if (!quality.accepted) {
        handleFaceFailure(quality.message ?? 'Capture rejected — please try again.');
        return;
      }

      const { embedding } = await faceEmbedder.computeEmbedding(captured.image);

      const location = await getPunchLocation();
      punchInFace({
        userId,
        embedding: [...embedding],
        embeddingModel: EMBEDDING_MODEL_ID,
        livenessChallengeType: CHALLENGE_TYPE_TO_GRAPHQL[challengeType],
        livenessSamples: liveness.getSamples().map((sample) => ({ ...sample })),
        // Generated fresh for this attempt (architecture-review-2026-07-16
        // .md's F7) — an offline-queued resume of *this specific* mutation
        // call reuses these same variables automatically (TanStack Query's
        // persisted-mutation pattern), so no extra state is needed here; a
        // genuinely new attempt always calls punchInFace again with a fresh
        // key, since it also has fresh liveness samples/embedding.
        idempotencyKey: generateIdempotencyKey(),
        // Captured now — the moment capture/liveness actually completed —
        // not whenever this mutation eventually reaches the server. A
        // follow-up review finding: without this, a punch queued offline
        // and resumed after local midnight got bucketed to the wrong day
        // server-side (see punchIn.ts's header comment).
        clientTimestamp: new Date().toISOString(),
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
      });
    } catch (err) {
      handleFaceFailure(
        getErrorMessage(err, "Let's try that again — hold steady and face the camera."),
      );
    } finally {
      setIsProcessingFace(false);
    }
  }

  // Once the liveness challenge completes, capture + embed + submit exactly
  // once per attempt (faceCaptureTriggeredRef guards against re-firing on
  // every subsequent frame while liveness.result stays "detected"). This
  // intentionally excludes handleFaceCapture from its deps — it's redefined
  // every render (not memoized), and the ref guard above already prevents
  // firing more than once per attempt, so depending on it would only force
  // redundant re-runs without changing behavior.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    if (!isFaceCameraActive || !liveness.result.detected || faceCaptureTriggeredRef.current) {
      return;
    }
    faceCaptureTriggeredRef.current = true;
    void handleFaceCapture();
  }, [liveness.result, isFaceCameraActive]);

  // Times the challenge out rather than waiting forever for a blink that
  // never comes (e.g. camera pointed away). Counts toward the fallback
  // threshold immediately when it fires (not deferred until "Try Again" is
  // tapped) — the failed attempt already happened at that point. faceAttemptId
  // isn't read in the effect body, but it's the deliberate mechanism for
  // restarting the timer when "Try Again" fires while isFaceCameraActive was
  // already true (that boolean alone wouldn't change value in that case).
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    if (!isFaceCameraActive) {
      return;
    }
    const timer = setTimeout(() => {
      setIsFaceTimedOut(true);
      setFaceFailureCount((count) => count + 1);
    }, FACE_CHALLENGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isFaceCameraActive, faceAttemptId]);

  return {
    cameraRef,
    hasCameraPermission,
    requestCameraPermission,
    hasDevice,
    isFaceCameraActive,
    faceAttemptId,
    faceError,
    isFaceTimedOut,
    isProcessingFace: isProcessingFace || isPunchingInFace,
    faceFailureCount,
    isFaceAligned,
    cameraLayoutSize,
    setCameraLayoutSize,
    liveness,
    isFacePunchError,
    facePunchErrorMessage: isFacePunchError ? getErrorMessage(facePunchError) : null,
    isFacePunchPaused,
    handleFrame,
    handleFaceFailure,
    handleRetryAfterTimeout,
    handleStartFaceVerification,
    handleCancelFaceVerification,
  };
}
