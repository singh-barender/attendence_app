/**
 * Shared, platform-neutral types for the face-camera abstraction (task 3.8,
 * ADR-006) — `faceCamera.native.tsx`/`faceCamera.web.tsx` both implement
 * this same shape (a `useFaceCameraPermission` hook + a `FaceCameraView`
 * component), so `Step3FaceEnrollScreen`/`LoginPunchInScreen` (neither of
 * which is itself platform-split) can drive the camera, live face info,
 * and a capture step identically regardless of platform. Only this file
 * (plain types, no platform-specific code) is safe to import from a
 * screen without triggering Metro's platform resolution.
 */
import type { FaceBounds } from '../utils/enrollmentQuality';

/** Shared cadence for throttling React state updates driven by per-frame
 * camera callbacks (enrollment's live alignment guide, verification's
 * alignment gate) — updating state on every single detected frame would
 * force excessive re-renders for no visible benefit; this is imperceptible
 * as a UI update rate but keeps render pressure sane. */
export const FRAME_STATE_THROTTLE_MS = 500;

/** The most recent live frame's face presence/bounds/dimensions/angle/eye
 * state — mirrors the shape both ML Kit (native) and Human (web) can
 * produce, updated on every frame regardless of any UI-level throttling. */
export interface LiveFaceInfo {
  readonly hasFace: boolean;
  /** How many faces the detector reported this frame. Verification and
   * enrollment both refuse to proceed when it's >1 (attendance integrity: a
   * second person must never be in frame when a punch is captured). */
  readonly faceCount: number;
  readonly bounds: FaceBounds | null;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly yawAngle: number | null;
  readonly leftEyeOpen: number | null;
  readonly rightEyeOpen: number | null;
  readonly smileProbability: number | null;
  readonly pitchAngle: number | null;
  readonly isOccluded: boolean;
}

/**
 * Result of a single capture, already platform-appropriately prepared:
 * native crops `image` to the live face bounds before returning (since its
 * embedder expects a pre-cropped face, ML Kit + TFLite being two separate
 * libraries); web returns the whole frame (since Human's embedder does
 * detection/alignment/embedding as one integrated pass over the full
 * frame). Callers never need to know which — `image` is always ready to
 * hand directly to `faceEmbedder.computeEmbedding()`. `previewUri` is
 * always a displayable string (`file://…` on native, a `data:` URL on
 * web) usable directly in a Tamagui `<Image source={{ uri }} />`.
 */
export interface CapturedFace<TImage> {
  readonly image: TImage;
  readonly averageBrightness: number;
  readonly sharpnessScore: number;
  readonly previewUri: string;
}

export interface FaceCameraViewHandle<TImage> {
  capture(): Promise<CapturedFace<TImage>>;
}

export interface FaceCameraViewProps {
  /** Called on every detected frame (throttle-free) — screens maintain
   * their own ref/state from this exactly as they did with the inline
   * vision-camera worklet before this extraction. */
  onFrame: (info: LiveFaceInfo) => void;
  /** Called when the camera itself fails after mounting — a permission
   * revoked mid-session, hardware/stream interruption, or (web only) a
   * `getUserMedia`/model-load failure. Distinct from a rejected
   * `capture()` call, which the screen's own try/catch around that call
   * already handles; this covers failures the screen can't otherwise
   * observe since they happen inside this component's own effects. */
  onError?: (error: Error) => void;
}
