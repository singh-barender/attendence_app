/**
 * Web counterpart to imageQualitySignals.native.ts (task 3.8, ADR-018) —
 * same brightness/sharpness measurement, but simpler: a canvas's
 * `ImageData` is always 8-bit RGBA, so there's no pixel-format detection
 * to do (unlike native, where the OS hands back a format that varies by
 * device/pipeline — see faceEmbedder.native.ts's `getRgbByteOffsets`).
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

/** Standard Rec. 601 luma weights — matches imageQualitySignals.native.ts's own constant exactly. */
function toLuma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Measures brightness and sharpness from a captured canvas. Draws it down
 * to a small fixed size first so cost doesn't scale with the capture's
 * native resolution.
 */
export function measureImageQuality(canvas: HTMLCanvasElement): ImageQualitySignal {
  const downscaled = document.createElement('canvas');
  downscaled.width = QUALITY_CHECK_SIZE;
  downscaled.height = QUALITY_CHECK_SIZE;
  const ctx = downscaled.getContext('2d');
  if (!ctx) {
    return { averageBrightness: 0, sharpnessScore: 0 };
  }
  ctx.drawImage(canvas, 0, 0, QUALITY_CHECK_SIZE, QUALITY_CHECK_SIZE);
  const imageData = ctx.getImageData(0, 0, QUALITY_CHECK_SIZE, QUALITY_CHECK_SIZE);
  return measureImageDataQuality(imageData);
}

/** Pure pixel-buffer half of measureImageQuality, split out for unit testing without a real canvas. */
export function measureImageDataQuality(imageData: {
  readonly data: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
}): ImageQualitySignal {
  const { data, width, height } = imageData;
  const pixelCount = width * height;
  if (pixelCount === 0) {
    return { averageBrightness: 0, sharpnessScore: 0 };
  }

  let brightnessSum = 0;
  let sharpnessSum = 0;
  let previousLuma: number | null = null;

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const offset = pixel * 4;
    const luma = toLuma(data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0);
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
