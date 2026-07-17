/**
 * @vladmandic/human `FaceResult` -> neutral-signal adapters (task 3.7/3.8)
 * — used by faceCamera.web.tsx to build the shared `LiveFaceInfo` shape
 * (platform/faceCameraTypes.ts) from Human's raw per-frame detection.
 * `platform/livenessSignals.ts` never sees a raw `FaceResult` at all —
 * it consumes the already-neutral `LiveFaceInfo` these adapters produce,
 * which is what let native and web collapse into one shared liveness file.
 */
import type { FaceResult } from '@vladmandic/human';
import { computeEyeOpenProbability, type EyeContourPoint } from './eyeOpenness';
import type { LiveFaceInfo } from './faceCameraTypes';
// Explicit `.web` extension, not the bare extensionless form — tsconfig's
// `moduleSuffixes` is `['.native', '']` (no `.web`, see tsconfig.json's own
// comment), so an extensionless import here would resolve under `tsc` to the
// *native* `faceOcclusionHeuristics.ts` (a different, ML-Kit-typed module)
// even though Metro correctly picks the `.web` file at bundle time. Matches
// the same explicit-`.web`-import precedent already used by
// `faceCamera.web.tsx` for `./humanFaceExtraction.web`/`./imageQualitySignals.web`.
import { computeFaceOcclusion } from './faceOcclusionHeuristics.web';

/** Combines an eye's upper+lower eyelid contour into the single point set
 * computeEyeOpenProbability expects — Human reports them as two separate
 * annotation arrays. */
export function eyeOpenProbabilityFrom(
  face: FaceResult,
  upperKey: string,
  lowerKey: string,
): number | null {
  const annotations = face.annotations as Record<string, EyeContourPoint[]>;
  const upper = annotations[upperKey] ?? [];
  const lower = annotations[lowerKey] ?? [];
  return computeEyeOpenProbability([...upper, ...lower]);
}

/**
 * Human's `rotation.angle.yaw` is in radians (confirmed against Human's
 * own source, `face/angles.ts`'s `rotationMatrixToEulerAngle`, which
 * derives it via `Math.atan2`) — ML Kit's `yawAngle` on native is in
 * degrees, and the shared yaw thresholds throughout this app
 * (utils/liveFaceAlignment.ts, packages/liveness) are calibrated for
 * degrees, so this conversion is required, not optional.
 */
export function yawDegreesFrom(face: FaceResult): number | null {
  const yawRadians = face.rotation?.angle.yaw;
  if (yawRadians === undefined || yawRadians === null) {
    return null;
  }
  return yawRadians * (180 / Math.PI);
}

export function pitchDegreesFrom(face: FaceResult): number | null {
  const pitchRadians = face.rotation?.angle.pitch;
  if (pitchRadians === undefined || pitchRadians === null) {
    return null;
  }
  return pitchRadians * (180 / Math.PI);
}

export function smileProbabilityFrom(face: FaceResult): number | null {
  if (!face.emotion || !Array.isArray(face.emotion)) {
    return null;
  }
  const happy = face.emotion.find((e) => e.emotion === 'happy');
  return happy ? happy.score : null;
}

/** Builds the shared `LiveFaceInfo` shape from Human's raw per-frame
 * detection — the one place `faceCamera.web.tsx` needs to reach for all of
 * the above adapters at once. `isOccluded`/`mouthBottom` now come from
 * `faceOcclusionHeuristics.web.ts`'s geometry check
 * (face-verification-pipeline-review-2026-07-16.md — previously hardcoded
 * `false`/`null`, meaning web had no occlusion detection of any kind).
 * `mouthBottom` is populated but has no current consumer on web — the
 * mouth-region-*sharpness* check that uses it on native stays native-only
 * (a separate, larger scope this pass doesn't attempt), so this is
 * forward-compatible, not yet acted on. */
export function faceResultToLiveInfo(
  face: FaceResult | undefined,
  faceCount: number,
  frameWidth: number,
  frameHeight: number,
): LiveFaceInfo {
  if (!face) {
    return {
      hasFace: false,
      faceCount,
      bounds: null,
      frameWidth,
      frameHeight,
      yawAngle: null,
      leftEyeOpen: null,
      rightEyeOpen: null,
      smileProbability: null,
      pitchAngle: null,
      isOccluded: false,
      mouthBottom: null,
    };
  }
  const [x, y, width, height] = face.box;
  const { isOccluded, mouthBottom } = computeFaceOcclusion(face);
  return {
    hasFace: true,
    faceCount,
    bounds: { x, y, width, height },
    frameWidth,
    frameHeight,
    yawAngle: yawDegreesFrom(face),
    leftEyeOpen: eyeOpenProbabilityFrom(face, 'leftEyeUpper0', 'leftEyeLower0'),
    rightEyeOpen: eyeOpenProbabilityFrom(face, 'rightEyeUpper0', 'rightEyeLower0'),
    smileProbability: smileProbabilityFrom(face),
    pitchAngle: pitchDegreesFrom(face),
    isOccluded,
    mouthBottom,
  };
}
