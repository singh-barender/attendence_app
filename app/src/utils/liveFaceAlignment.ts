/**
 * Live per-frame alignment guide (companion to enrollmentQuality.ts's
 * post-capture gate, task 2.7/ADR-018) — cheap enough to evaluate on every
 * detected frame, so the capture screen can show real-time framing feedback
 * (a red/green guide) instead of only reporting a rejection after the user
 * has already tapped Capture. Reuses the same size/centering thresholds as
 * the post-capture gate (imported, not duplicated) so the live guide and
 * the actual accept/reject decision never disagree. Brightness/sharpness
 * are deliberately excluded here — those signals only exist once a photo
 * has actually been captured, so they stay solely in enrollmentQuality.ts.
 */
import type { EnrollmentQualityRejectionReason, FaceBounds } from './enrollmentQuality';
import {
  MAX_CENTER_OFFSET_RATIO,
  MAX_FACE_SIZE_RATIO,
  MIN_EYE_OPEN_PROBABILITY,
  MIN_FACE_SIZE_RATIO,
  REJECTION_MESSAGES,
} from './enrollmentQuality';

/** The subset of post-capture rejection reasons that also apply live
 * (brightness/sharpness/hand-detection only exist once a photo has actually
 * been captured, so they're excluded here), plus `wrong-angle`, which only
 * makes sense live — a capture is accepted at whatever angle it happened at,
 * the live guide's job is steering the user to the *requested* one first. */
export type LiveAlignmentReason =
  | Exclude<
      EnrollmentQualityRejectionReason,
      'too-dark' | 'too-bright' | 'too-blurry' | 'hand-detected'
    >
  | 'wrong-angle';

export interface LiveAlignmentResult {
  readonly aligned: boolean;
  /** Why the current frame isn't aligned — `null` when `aligned` is `true`. */
  readonly reason: LiveAlignmentReason | null;
}

const WRONG_ANGLE_MESSAGE = 'Turn your head to match the requested angle.';

/** User-facing text for a live alignment reason — shares wording with the
 * post-capture gate wherever the reason exists there too (see
 * `REJECTION_MESSAGES`), so the same problem never reads as two different
 * messages depending on whether it was caught live or after capture. */
export function getLiveAlignmentMessage(reason: LiveAlignmentReason): string {
  if (reason === 'wrong-angle') {
    return WRONG_ANGLE_MESSAGE;
  }
  return REJECTION_MESSAGES[reason];
}

/** A yaw turn shallower than this doesn't reliably read as a profile shot. */
export const MIN_PROFILE_YAW_DEGREES = 15;
/** A yaw turn beyond this no longer reads as facing the camera head-on. */
export const MAX_FRONTAL_YAW_DEGREES = 12;

export interface LiveAlignmentSample {
  readonly hasFace: boolean;
  /** Faces detected this frame — more than one is never "aligned" (a second
   * person must not be in frame). Optional so callers/fixtures without the
   * signal default to single-face. */
  readonly faceCount?: number;
  readonly faceBounds: FaceBounds | null;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly yawAngle: number | null;
  /** Inclusive lower bound the live yaw must meet for the current target angle. */
  readonly minYawDegrees: number;
  /** Inclusive upper bound the live yaw must meet for the current target angle. */
  readonly maxYawDegrees: number;
  readonly isOccluded?: boolean;
  /** Eye-open probabilities for this frame — checked against the same
   * `MIN_EYE_OPEN_PROBABILITY` floor the post-capture gate enforces, so a
   * hand/object covering an eye reddens the oval immediately instead of only
   * surfacing as a rejection after the user taps Capture (found via
   * live-device testing: a hand covering one eye still showed a green oval,
   * since this check previously existed only post-capture). Optional/nullable
   * so a legitimately-turned-away eye during a profile capture — which ML Kit
   * may report as `null` rather than a low number — isn't penalized here any
   * more than the post-capture gate already penalizes it. */
  readonly leftEyeOpen?: number | null;
  readonly rightEyeOpen?: number | null;
}

/**
 * Whether the current live frame looks ready to capture for the active
 * angle — the same presence/size/centering checks as the post-capture gate,
 * plus a yaw-range check the post-capture gate doesn't need (a capture is
 * accepted at whatever angle the user happened to be at; the live guide's
 * job is steering them there in the first place). Returns *why* a frame
 * isn't aligned, not just whether it is, so the capture screen can show a
 * specific "eyes closed" / "something is covering your face" message
 * instead of one generic "align your face" hint regardless of cause
 * (user-requested — previously this was a bare boolean with no reason).
 * Checks run in a fixed priority order, same discipline as
 * `assessEnrollmentQuality`'s post-capture reasons, so a frame with several
 * problems at once always reports the single most relevant one.
 */
export function assessLiveAlignment(sample: LiveAlignmentSample): LiveAlignmentResult {
  if (!sample.hasFace || !sample.faceBounds || sample.yawAngle === null) {
    return { aligned: false, reason: 'no-face' };
  }
  if (sample.faceCount != null && sample.faceCount > 1) {
    return { aligned: false, reason: 'multiple-faces' };
  }
  if (sample.isOccluded) {
    return { aligned: false, reason: 'occluded' };
  }
  if (
    (sample.leftEyeOpen != null && sample.leftEyeOpen < MIN_EYE_OPEN_PROBABILITY) ||
    (sample.rightEyeOpen != null && sample.rightEyeOpen < MIN_EYE_OPEN_PROBABILITY)
  ) {
    return { aligned: false, reason: 'eyes-closed' };
  }

  const shorterFrameSide = Math.min(sample.frameWidth, sample.frameHeight);
  const minFaceSize = Math.min(sample.faceBounds.width, sample.faceBounds.height);
  if (shorterFrameSide <= 0 || minFaceSize / shorterFrameSide < MIN_FACE_SIZE_RATIO) {
    return { aligned: false, reason: 'too-small' };
  }
  const maxFaceSize = Math.max(sample.faceBounds.width, sample.faceBounds.height);
  if (maxFaceSize / shorterFrameSide > MAX_FACE_SIZE_RATIO) {
    return { aligned: false, reason: 'too-close' };
  }

  const faceCenterX = sample.faceBounds.x + sample.faceBounds.width / 2;
  const faceCenterY = sample.faceBounds.y + sample.faceBounds.height / 2;
  const offsetXRatio = Math.abs(faceCenterX - sample.frameWidth / 2) / sample.frameWidth;
  const offsetYRatio = Math.abs(faceCenterY - sample.frameHeight / 2) / sample.frameHeight;
  if (offsetXRatio > MAX_CENTER_OFFSET_RATIO || offsetYRatio > MAX_CENTER_OFFSET_RATIO) {
    return { aligned: false, reason: 'off-center' };
  }

  if (sample.yawAngle >= sample.minYawDegrees && sample.yawAngle <= sample.maxYawDegrees) {
    return { aligned: true, reason: null };
  }
  return { aligned: false, reason: 'wrong-angle' };
}
