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
import type { FaceBounds } from './enrollmentQuality';
import { MAX_CENTER_OFFSET_RATIO, MIN_FACE_SIZE_RATIO } from './enrollmentQuality';

/** A yaw turn shallower than this doesn't reliably read as a profile shot. */
export const MIN_PROFILE_YAW_DEGREES = 15;
/** A yaw turn beyond this no longer reads as facing the camera head-on. */
export const MAX_FRONTAL_YAW_DEGREES = 12;

export interface LiveAlignmentSample {
  readonly hasFace: boolean;
  readonly faceBounds: FaceBounds | null;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly yawAngle: number | null;
  /** Inclusive lower bound the live yaw must meet for the current target angle. */
  readonly minYawDegrees: number;
  /** Inclusive upper bound the live yaw must meet for the current target angle. */
  readonly maxYawDegrees: number;
}

/**
 * Whether the current live frame looks ready to capture for the active
 * angle — the same presence/size/centering checks as the post-capture gate,
 * plus a yaw-range check the post-capture gate doesn't need (a capture is
 * accepted at whatever angle the user happened to be at; the live guide's
 * job is steering them there in the first place).
 */
export function assessLiveAlignment(sample: LiveAlignmentSample): boolean {
  if (!sample.hasFace || !sample.faceBounds || sample.yawAngle === null) {
    return false;
  }

  const shorterFrameSide = Math.min(sample.frameWidth, sample.frameHeight);
  const faceSize = Math.min(sample.faceBounds.width, sample.faceBounds.height);
  if (shorterFrameSide <= 0 || faceSize / shorterFrameSide < MIN_FACE_SIZE_RATIO) {
    return false;
  }

  const faceCenterX = sample.faceBounds.x + sample.faceBounds.width / 2;
  const faceCenterY = sample.faceBounds.y + sample.faceBounds.height / 2;
  const offsetXRatio = Math.abs(faceCenterX - sample.frameWidth / 2) / sample.frameWidth;
  const offsetYRatio = Math.abs(faceCenterY - sample.frameHeight / 2) / sample.frameHeight;
  if (offsetXRatio > MAX_CENTER_OFFSET_RATIO || offsetYRatio > MAX_CENTER_OFFSET_RATIO) {
    return false;
  }

  return sample.yawAngle >= sample.minYawDegrees && sample.yawAngle <= sample.maxYawDegrees;
}
