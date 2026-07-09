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
