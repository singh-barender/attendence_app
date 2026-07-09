/**
 * Enrollment quality gate (task 2.7, ADR-018) — pure decision logic reusing
 * signals already available from the existing detection/frame stack (no new
 * ML library, per ADR-018): ML Kit's `Face` bounds (presence + centering,
 * task 2.2) and a brightness/sharpness reading of the captured photo itself
 * (`imageQualitySignals.native.ts`, task 2.7). Kept platform-agnostic and
 * pure so it's unit-testable without a camera or native image decoder.
 */

/** Face bounding box, in the same coordinate space as frameWidth/frameHeight. */
export interface FaceBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface EnrollmentQualitySample {
  /** Whether ML Kit reported any face at all in the live frame at capture time. */
  readonly hasFace: boolean;
  readonly faceBounds: FaceBounds | null;
  readonly frameWidth: number;
  readonly frameHeight: number;
  /** Mean luma (0-255), sampled from the captured photo. */
  readonly averageBrightness: number;
  /**
   * Mean absolute difference between neighboring luma samples in the
   * captured photo — a cheap proxy for in-focus detail; near-zero means a
   * flat/blurry image with little high-frequency content.
   */
  readonly sharpnessScore: number;
}

export type EnrollmentQualityRejectionReason =
  | 'no-face'
  | 'too-dark'
  | 'too-bright'
  | 'too-blurry'
  | 'too-small'
  | 'off-center';

export interface EnrollmentQualityResult {
  readonly accepted: boolean;
  readonly reason: EnrollmentQualityRejectionReason | null;
  readonly message: string | null;
}

/** Below this mean luma (0-255), a capture is considered too dark to enroll reliably. */
export const MIN_BRIGHTNESS = 60;
/** Above this mean luma, a capture is considered overexposed/washed out. */
export const MAX_BRIGHTNESS = 220;
/** Below this mean adjacent-luma difference, a capture is considered too blurry/out of focus. */
export const MIN_SHARPNESS_SCORE = 4;
/** Face bounding box must cover at least this fraction of the frame's shorter side to count as "close enough". */
export const MIN_FACE_SIZE_RATIO = 0.2;
/** Face bounding box center must fall within this fraction of frame width/height from true center. */
export const MAX_CENTER_OFFSET_RATIO = 0.2;

const REJECTION_MESSAGES: Record<EnrollmentQualityRejectionReason, string> = {
  'no-face': 'We couldn’t see your face — make sure it’s clearly visible and try again.',
  'too-dark': 'It’s too dark for a good capture — move somewhere brighter and try again.',
  'too-bright': 'That’s too bright and washed out — move out of direct light and try again.',
  'too-blurry': 'That shot came out blurry — hold still and try again.',
  'too-small': 'Move a little closer so your face fills more of the frame.',
  'off-center': 'Center your face in the frame and try again.',
};

function reject(reason: EnrollmentQualityRejectionReason): EnrollmentQualityResult {
  return { accepted: false, reason, message: REJECTION_MESSAGES[reason] };
}

/**
 * Judges whether a single enrollment capture meets the quality bar. Checks
 * run in a fixed order (presence, exposure, focus, framing) so a rejected
 * capture always reports its single most relevant reason, not an arbitrary
 * one when multiple issues are present at once.
 */
export function assessEnrollmentQuality(sample: EnrollmentQualitySample): EnrollmentQualityResult {
  if (!sample.hasFace || !sample.faceBounds) {
    return reject('no-face');
  }
  if (sample.averageBrightness < MIN_BRIGHTNESS) {
    return reject('too-dark');
  }
  if (sample.averageBrightness > MAX_BRIGHTNESS) {
    return reject('too-bright');
  }
  if (sample.sharpnessScore < MIN_SHARPNESS_SCORE) {
    return reject('too-blurry');
  }

  const shorterFrameSide = Math.min(sample.frameWidth, sample.frameHeight);
  const faceSize = Math.min(sample.faceBounds.width, sample.faceBounds.height);
  if (shorterFrameSide > 0 && faceSize / shorterFrameSide < MIN_FACE_SIZE_RATIO) {
    return reject('too-small');
  }

  const faceCenterX = sample.faceBounds.x + sample.faceBounds.width / 2;
  const faceCenterY = sample.faceBounds.y + sample.faceBounds.height / 2;
  const offsetXRatio = Math.abs(faceCenterX - sample.frameWidth / 2) / sample.frameWidth;
  const offsetYRatio = Math.abs(faceCenterY - sample.frameHeight / 2) / sample.frameHeight;
  if (offsetXRatio > MAX_CENTER_OFFSET_RATIO || offsetYRatio > MAX_CENTER_OFFSET_RATIO) {
    return reject('off-center');
  }

  return { accepted: true, reason: null, message: null };
}
