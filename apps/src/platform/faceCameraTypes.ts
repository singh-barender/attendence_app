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
  /** Frame-space position of the mouth-bottom landmark, when reported —
   * feeds the post-capture mouth-region texture check (see
   * `CapturedFace.mouthRegionSharpnessRatio`). Native (ML Kit) only; web
   * reports `null` and that check simply never fires there. */
  readonly mouthBottom: { readonly x: number; readonly y: number } | null;
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
  /**
   * Local texture-detail ratio at the detected mouth position, relative to
   * the whole face's own sharpness (both from `measureImageQuality`'s
   * existing luma-variance measure — no new pixel-processing primitive, just
   * applied to a smaller region) — a hand/object flat against the lens in
   * front of the mouth reads as markedly *smoother* than the rest of a real
   * face, which reliably has texture there (lips, philtrum, facial hair).
   * `null` when no mouth landmark was available (e.g. web, or a live face
   * lost between the guide and the shutter) — that check is then skipped
   * rather than treated as a rejection.
   */
  readonly mouthRegionSharpnessRatio: number | null;
  /**
   * Whether a dedicated hand/palm detector (ADR-031) found a hand near the
   * face at capture time — a genuinely different signal from
   * `mouthRegionSharpnessRatio`/ML Kit's own landmarks, added after those
   * proved unable to reliably tell a real mouth from a hand covering it.
   * Always `false` on web (no equivalent detector wired up there), which
   * simply means that check never fires rather than being treated as a
   * detected hand.
   */
  readonly handDetected: boolean;
  /**
   * Presence/geometry/eye/occlusion signals derived from the SAME instant as
   * `image` above, not a preceding live-preview frame. Native re-runs face
   * detection against the actual captured photo (`capturedPhotoFaceDetection.native.ts`)
   * specifically because the live-frame detector driving the on-screen guide
   * can be a real shutter-latency's worth of time stale by the moment a photo
   * is actually written — a blink or a hand moving into frame during that gap
   * was previously invisible to the quality gate, which judged a different
   * moment in time than the photo it was accepting. Web reuses its own
   * already-fresh live detection (its capture() has no comparable shutter
   * latency to be stale across).
   */
  readonly hasFace: boolean;
  readonly faceCount: number;
  readonly faceBounds: FaceBounds | null;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly leftEyeOpen: number | null;
  readonly rightEyeOpen: number | null;
  readonly isOccluded: boolean;
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
