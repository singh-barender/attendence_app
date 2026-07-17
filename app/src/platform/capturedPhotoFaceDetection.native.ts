/**
 * Re-runs face detection against the actual captured photo, not the live
 * preview stream (face-verification-pipeline-review-2026-07-16.md's root
 * cause finding) — the live-frame detector driving the on-screen guide is
 * fast but reflects the world as of whenever that frame arrived; a genuine
 * hardware shutter capture (`photoOutput.capturePhoto()`) has real,
 * non-trivial latency, and a blink or a hand moving into frame during that
 * gap was previously invisible to the quality gate, which judged a
 * different instant than the photo it went on to accept.
 *
 * Uses `react-native-vision-camera-face-detector`'s `useImageFaceDetector`
 * (confirmed present in the already-installed dependency, v2.0.5, by
 * reading its source directly rather than assumed) — a static-image
 * detection path distinct from the live `useFaceDetector`/`Frame` API this
 * app already uses, returning the exact same `Face` shape, so
 * `computeFaceOcclusion` is reused completely unchanged.
 */
import { File } from 'expo-file-system';
import type { Image } from 'react-native-nitro-image';
import type { ImageFaceDetector } from 'react-native-vision-camera-face-detector';
import type { FaceBounds } from '../utils/enrollmentQuality';
import { computeFaceOcclusion } from './faceOcclusionHeuristics';

/** JPEG quality for the throwaway detection-only temp file — higher than
 * the on-screen preview's quality, since detection accuracy matters more
 * here than file size, and this file is never shown to the user. */
const DETECTION_JPEG_QUALITY = 90;

export interface CapturedPhotoFaceInfo {
  readonly hasFace: boolean;
  readonly faceCount: number;
  readonly bounds: FaceBounds | null;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly leftEyeOpen: number | null;
  readonly rightEyeOpen: number | null;
  readonly isOccluded: boolean;
  readonly mouthBottom: { readonly x: number; readonly y: number } | null;
}

/**
 * `detectFaces` takes a file URI, not an in-memory buffer, so the
 * rotation-corrected (but not yet cropped) `image` is written to a
 * throwaway temp file first — cropping happens downstream of this call
 * (`faceCamera.native.tsx`), using this function's fresh `bounds` rather
 * than a live-preview-derived one, so cropping benefits from the same
 * freshness fix. The temp file is deleted immediately after detection
 * (best-effort — a leaked temp file isn't worth failing the capture over).
 */
export async function detectFaceOnCapturedImage(
  detector: ImageFaceDetector,
  image: Image,
): Promise<CapturedPhotoFaceInfo> {
  const tempPath = await image.saveToTemporaryFileAsync('jpg', DETECTION_JPEG_QUALITY);
  try {
    const faces = detector.detectFaces(`file://${tempPath}`);
    const firstFace = faces[0];
    const { isOccluded, mouthBottom } = computeFaceOcclusion(firstFace);

    return {
      hasFace: Boolean(firstFace),
      faceCount: faces.length,
      bounds: firstFace?.bounds ?? null,
      frameWidth: image.width,
      frameHeight: image.height,
      leftEyeOpen: firstFace?.leftEyeOpenProbability ?? null,
      rightEyeOpen: firstFace?.rightEyeOpenProbability ?? null,
      isOccluded,
      mouthBottom,
    };
  } finally {
    try {
      new File(tempPath).delete();
    } catch {
      // Best-effort cleanup only — not worth surfacing to the caller.
    }
  }
}
