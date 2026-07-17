import { measureImageDataQuality } from './imageQualitySignals.web';

/** Builds a size x size RGBA buffer where pixel luma follows the given per-pixel-index function. */
function makeImageData(size: number, lumaAt: (index: number) => number) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const value = Math.round(lumaAt(i));
    data.set([value, value, value, 255], i * 4);
  }
  return { data, width: size, height: size };
}

describe('measureImageDataQuality', () => {
  it('reports the exact uniform brightness of a flat image', () => {
    const imageData = makeImageData(8, () => 128);
    const result = measureImageDataQuality(imageData);
    expect(result.averageBrightness).toBeCloseTo(128);
  });

  it('reports near-zero sharpness for a perfectly flat (uniform) image', () => {
    const imageData = makeImageData(8, () => 100);
    const result = measureImageDataQuality(imageData);
    expect(result.sharpnessScore).toBeCloseTo(0);
  });

  it('reports high sharpness for a high-contrast alternating pattern', () => {
    const imageData = makeImageData(8, (i) => (i % 2 === 0 ? 0 : 255));
    const result = measureImageDataQuality(imageData);
    expect(result.sharpnessScore).toBeGreaterThan(200);
  });

  it('computes brightness as the average of RGB channels via luma weights', () => {
    // Pure red (255,0,0): luma = 0.299*255 = 76.245
    const size = 4;
    const data = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      data.set([255, 0, 0, 255], i * 4);
    }
    const result = measureImageDataQuality({ data, width: size, height: size });
    expect(result.averageBrightness).toBeCloseTo(0.299 * 255, 0);
  });

  it('returns zero for an empty (zero-pixel) image without dividing by zero', () => {
    const result = measureImageDataQuality({ data: new Uint8ClampedArray(0), width: 0, height: 0 });
    expect(result.averageBrightness).toBe(0);
    expect(result.sharpnessScore).toBe(0);
  });
});
