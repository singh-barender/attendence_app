/**
 * Native (Android) image-quality signal extraction (task 2.7, ADR-018) —
 * measures brightness and a sharpness proxy from a captured enrollment
 * photo, reusing the same `react-native-nitro-image` resize/raw-pixel
 * pipeline established in `faceEmbedder.native.ts` (task 2.4), including
 * that module's own pixel-format handling (`getRgbByteOffsets`), rather
 * than duplicating it.
 */
import type { Image } from 'react-native-nitro-image';
import { getRgbByteOffsets } from './faceEmbedder';

/**
 * The quality check only needs a coarse read on exposure/focus, not
 * per-pixel precision — resizing down first keeps this cheap regardless of
 * the photo's actual capture resolution.
 */
const QUALITY_CHECK_SIZE = 64;

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
