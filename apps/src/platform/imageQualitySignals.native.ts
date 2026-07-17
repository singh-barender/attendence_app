/**
 * Native (Android) image-quality signal extraction (task 2.7, ADR-018) —
 * measures brightness and a sharpness proxy from a captured enrollment
 * photo, reusing the same `react-native-nitro-image` resize/raw-pixel
 * pipeline established in `faceEmbedder.native.ts` (task 2.4), including
 * that module's own pixel-format handling (`getRgbByteOffsets`), rather
 * than duplicating it.
 */
import type { Image } from 'react-native-nitro-image';
import { type CropRect, clamp, mapFacePointToImageSpace } from '../utils/faceCrop';
import { getRgbByteOffsets } from './faceEmbedder';

/**
 * The quality check only needs a coarse read on exposure/focus, not
 * per-pixel precision — resizing down first keeps this cheap regardless of
 * the photo's actual capture resolution.
 */
const QUALITY_CHECK_SIZE = 64;

/**
 * Mouth-region patch size, as a fraction of the detected face's width —
 * wide enough to reliably contain the mouth/lips regardless of minor
 * landmark-position noise, narrow enough to stay a genuinely *local*
 * texture sample rather than drifting into cheek/chin skin.
 */
const MOUTH_PATCH_SIZE_RATIO = 0.3;

export interface ImageQualitySignal {
  /** Mean luma (0-255) across the (downsized) image. */
  readonly averageBrightness: number;
  /**
   * Mean absolute difference between raster-order-adjacent luma samples —
   * near-zero for a flat/blurry image, higher for one with real detail.
   */
  readonly sharpnessScore: number;
}

/** Standard Rec. 601 luma weights, applied per-pixel to derive brightness/sharpness from RGB. */
function toLuma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Measures brightness and sharpness from a captured `Image` (e.g. from
 * `Photo.toImage()`). Resizes to a small fixed size first so cost doesn't
 * scale with the photo's native resolution.
 */
export function measureImageQuality(image: Image): ImageQualitySignal {
  const resized = image.resize(QUALITY_CHECK_SIZE, QUALITY_CHECK_SIZE);
  const pixelData = resized.toRawPixelData();
  return measurePixelDataQuality(pixelData);
}

/** Pure pixel-buffer half of measureImageQuality, split out for unit testing without a real Image. */
export function measurePixelDataQuality(
  pixelData: ReturnType<Image['toRawPixelData']>,
): ImageQualitySignal {
  const { buffer, width, height, pixelFormat } = pixelData;
  const { r, g, b, bytesPerPixel } = getRgbByteOffsets(pixelFormat);
  const bytes = new Uint8Array(buffer);
  const pixelCount = width * height;

  if (pixelCount === 0) {
    return { averageBrightness: 0, sharpnessScore: 0 };
  }

  let brightnessSum = 0;
  let sharpnessSum = 0;
  let previousLuma: number | null = null;

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const offset = pixel * bytesPerPixel;
    const luma = toLuma(
      bytes.at(offset + r) ?? 0,
      bytes.at(offset + g) ?? 0,
      bytes.at(offset + b) ?? 0,
    );
    brightnessSum += luma;
    if (previousLuma !== null) {
      sharpnessSum += Math.abs(luma - previousLuma);
    }
    previousLuma = luma;
  }

  return {
    averageBrightness: brightnessSum / pixelCount,
    sharpnessScore: pixelCount > 1 ? sharpnessSum / (pixelCount - 1) : 0,
  };
}

/**
 * Measures local texture-detail (the same luma-variance sharpness proxy as
 * `measureImageQuality`, just scoped to a small patch) around a specific
 * point in `image` — used to check whether the mouth position specifically
 * looks like real facial detail (lips, facial hair, the shadowed mouth
 * opening) or a flat covering object (a hand/finger held in front of the
 * lens), independent of the whole photo's own sharpness. Confirmed via
 * live-device testing that ML Kit's landmark model keeps reporting a
 * plausible-looking mouth *position* even when a hand covers it — geometry
 * alone (`faceCamera.native.tsx`'s live occlusion check) can't always tell
 * the two apart, but a flat hand/finger surface reliably reads as far
 * smoother, locally, than genuine facial texture.
 */
export function measureMouthRegionSharpness(
  image: Image,
  mouthPoint: { readonly x: number; readonly y: number },
  faceWidth: number,
): number {
  const patchSize = Math.max(faceWidth * MOUTH_PATCH_SIZE_RATIO, 1);
  const halfPatch = patchSize / 2;
  const startX = clamp(mouthPoint.x - halfPatch, 0, image.width);
  const startY = clamp(mouthPoint.y - halfPatch, 0, image.height);
  const endX = clamp(mouthPoint.x + halfPatch, 0, image.width);
  const endY = clamp(mouthPoint.y + halfPatch, 0, image.height);
  const patch = image.crop(startX, startY, endX, endY);
  const resized = patch.resize(QUALITY_CHECK_SIZE, QUALITY_CHECK_SIZE);
  return measurePixelDataQuality(resized.toRawPixelData()).sharpnessScore;
}

/**
 * Maps a frame-space mouth landmark into `croppedImage`'s own coordinate
 * space (via the full, uncropped `image` and the crop rect used to produce
 * `croppedImage`) and returns its local-sharpness ratio against the whole
 * face's own sharpness — the full computation `faceCamera.native.tsx`'s
 * `capture()` needs, split out so that call site only has to make one call
 * rather than re-deriving this coordinate math itself.
 */
export function computeMouthRegionSharpnessRatio(
  mouthBottomInFrame: { readonly x: number; readonly y: number } | null,
  frameWidth: number,
  frameHeight: number,
  image: Image,
  croppedImage: Image,
  cropRect: CropRect | null,
): number | null {
  if (!mouthBottomInFrame) {
    return null;
  }
  const mouthPointInImage = mapFacePointToImageSpace(
    mouthBottomInFrame,
    frameWidth,
    frameHeight,
    image.width,
    image.height,
  );
  const mouthPointInCroppedImage = cropRect
    ? { x: mouthPointInImage.x - cropRect.startX, y: mouthPointInImage.y - cropRect.startY }
    : mouthPointInImage;
  const mouthRegionSharpness = measureMouthRegionSharpness(
    croppedImage,
    mouthPointInCroppedImage,
    croppedImage.width,
  );
  const faceSharpness = measureImageQuality(croppedImage).sharpnessScore;
  return faceSharpness > 0 ? mouthRegionSharpness / faceSharpness : null;
}
