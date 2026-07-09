/**
 * Face-crop coordinate mapping (task 2.8) — converts an ML Kit face
 * bounding box (in the live frame stream's coordinate space) into crop
 * coordinates in a separately-captured photo's coordinate space. Valid as
 * long as both share the same aspect ratio — Step3FaceEnrollScreen
 * deliberately requests matching 4:3 `targetResolution`s for both the
 * frame stream and the photo output (task 2.8) so a face's *fractional*
 * position within the frame is the same fractional position within the
 * photo, regardless of the two streams' different absolute resolutions.
 */
import type { FaceBounds } from './enrollmentQuality';

/**
 * Expands the tight ML Kit bounding box by this fraction on each side
 * before cropping — a bare detector box often clips forehead/chin, which
 * hurts embedding quality; a modest margin is standard face-recognition
 * preprocessing practice.
 */
export const FACE_CROP_MARGIN_RATIO = 0.2;

export interface CropRect {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Maps a face bounding box (in `frameWidth` x `frameHeight` space) to a
 * margin-padded, bounds-clamped crop rectangle in `imageWidth` x
 * `imageHeight` space.
 */
export function mapFaceBoundsToCropRect(
  bounds: FaceBounds,
  frameWidth: number,
  frameHeight: number,
  imageWidth: number,
  imageHeight: number,
  marginRatio: number = FACE_CROP_MARGIN_RATIO,
): CropRect {
  const marginX = bounds.width * marginRatio;
  const marginY = bounds.height * marginRatio;

  const xRatioStart = (bounds.x - marginX) / frameWidth;
  const yRatioStart = (bounds.y - marginY) / frameHeight;
  const xRatioEnd = (bounds.x + bounds.width + marginX) / frameWidth;
  const yRatioEnd = (bounds.y + bounds.height + marginY) / frameHeight;

  return {
    startX: clamp(xRatioStart * imageWidth, 0, imageWidth),
    startY: clamp(yRatioStart * imageHeight, 0, imageHeight),
    endX: clamp(xRatioEnd * imageWidth, 0, imageWidth),
    endY: clamp(yRatioEnd * imageHeight, 0, imageHeight),
  };
}
