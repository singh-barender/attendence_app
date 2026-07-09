// imageQualitySignals.native.ts imports getRgbByteOffsets from
// faceEmbedder.native.ts, which imports react-native-fast-tflite — a native
// Nitro module resolved eagerly at import time (not lazily) — so it must be
// mocked here too, same as faceEmbedder.native.test.ts.
jest.mock('react-native-fast-tflite', () => ({ loadTensorflowModel: jest.fn() }));

import { measurePixelDataQuality } from './imageQualitySignals.native';

/** Builds a size x size RGBA buffer where pixel luma follows the given per-pixel-index function. */
function makePixelData(size: number, lumaAt: (index: number) => number) {
  const buffer = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const value = Math.round(lumaAt(i));
    buffer.set([value, value, value, 255], i * 4);
  }
  return { buffer: buffer.buffer, width: size, height: size, pixelFormat: 'RGBA' as const };
}

describe('measurePixelDataQuality', () => {
  it('reports the exact uniform brightness of a flat image', () => {
    const pixelData = makePixelData(8, () => 128);
    const result = measurePixelDataQuality(pixelData);
    expect(result.averageBrightness).toBeCloseTo(128);
  });

  it('reports near-zero sharpness for a perfectly flat (uniform) image', () => {
    const pixelData = makePixelData(8, () => 100);
    const result = measurePixelDataQuality(pixelData);
    expect(result.sharpnessScore).toBeCloseTo(0);
  });

  it('reports high sharpness for a high-contrast alternating pattern', () => {
    const pixelData = makePixelData(8, (i) => (i % 2 === 0 ? 0 : 255));
    const result = measurePixelDataQuality(pixelData);
    expect(result.sharpnessScore).toBeGreaterThan(200);
  });

  it('computes brightness as the average of RGB channels via luma weights', () => {
    // Pure red (255,0,0): luma = 0.299*255 = 76.245
    const size = 4;
    const buffer = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      buffer.set([255, 0, 0, 255], i * 4);
    }
    const pixelData = {
      buffer: buffer.buffer,
      width: size,
      height: size,
      pixelFormat: 'RGBA' as const,
    };
    const result = measurePixelDataQuality(pixelData);
    expect(result.averageBrightness).toBeCloseTo(0.299 * 255, 0);
  });

  it('un-swaps BGRA channel order before computing luma', () => {
    const size = 4;
    const buffer = new Uint8Array(size * size * 4);
    // BGRA: blue=255 stored first, meaning this pixel is pure blue.
    for (let i = 0; i < size * size; i++) {
      buffer.set([255, 0, 0, 255], i * 4);
    }
    const pixelData = {
      buffer: buffer.buffer,
      width: size,
      height: size,
      pixelFormat: 'BGRA' as const,
    };
    const result = measurePixelDataQuality(pixelData);
    // Pure blue: luma = 0.114*255
    expect(result.averageBrightness).toBeCloseTo(0.114 * 255, 0);
  });

  it('returns zero for an empty (zero-pixel) image without dividing by zero', () => {
    const pixelData = {
      buffer: new ArrayBuffer(0),
      width: 0,
      height: 0,
      pixelFormat: 'RGBA' as const,
    };
    const result = measurePixelDataQuality(pixelData);
    expect(result.averageBrightness).toBe(0);
    expect(result.sharpnessScore).toBe(0);
  });
});
