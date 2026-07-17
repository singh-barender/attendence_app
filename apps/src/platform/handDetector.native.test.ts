// react-native-fast-tflite resolves a native Nitro module at import time
// (not lazily) — only pure-logic exports (pixelDataToInputTensor) are under
// test here, so the native loader itself is mocked out rather than pulled
// into this jest environment, same as faceEmbedder.native.test.ts.
jest.mock('react-native-fast-tflite', () => ({ loadTensorflowModel: jest.fn() }));

import { pixelDataToInputTensor } from './handDetector.native';

describe('pixelDataToInputTensor', () => {
  const MODEL_SIZE = 192;

  /** Builds a MODEL_SIZE x MODEL_SIZE buffer with every pixel set to the same [r,g,b,a] value. */
  function makeUniformPixelData(
    pixelFormat: 'RGBA' | 'BGRA',
    [r, g, b, a]: [number, number, number, number],
    size = MODEL_SIZE,
  ) {
    const pixelCount = size * size;
    const buffer = new Uint8Array(pixelCount * 4);
    const bytes = pixelFormat === 'RGBA' ? [r, g, b, a] : [b, g, r, a];
    for (let i = 0; i < pixelCount; i++) {
      buffer.set(bytes, i * 4);
    }
    return { buffer: buffer.buffer, width: size, height: size, pixelFormat };
  }

  it('normalizes RGBA pixels to the palm detector’s [0,1] (divide by 255) range', () => {
    const pixelData = makeUniformPixelData('RGBA', [255, 0, 128, 255]);
    const tensor = new Float32Array(pixelDataToInputTensor(pixelData));
    expect(tensor[0]).toBeCloseTo(1);
    expect(tensor[1]).toBeCloseTo(0);
    expect(tensor[2]).toBeCloseTo(128 / 255);
  });

  it('correctly un-swaps BGRA channel order back to RGB', () => {
    const pixelData = makeUniformPixelData('BGRA', [10, 20, 30, 255]);
    const tensor = new Float32Array(pixelDataToInputTensor(pixelData));
    expect(tensor[0]).toBeCloseTo(10 / 255);
    expect(tensor[1]).toBeCloseTo(20 / 255);
    expect(tensor[2]).toBeCloseTo(30 / 255);
  });

  it('throws if the image is not already resized to the model input size', () => {
    const pixelData = makeUniformPixelData('RGBA', [0, 0, 0, 255], 1);
    expect(() => pixelDataToInputTensor(pixelData)).toThrow(/Expected a 192x192 image/);
  });
});
