// react-native-fast-tflite resolves a native Nitro module at import time
// (not lazily) — only pure-logic exports (getRgbByteOffsets,
// pixelDataToInputTensor) are under test here, so the native loader itself
// is mocked out rather than pulled into this jest environment.
jest.mock('react-native-fast-tflite', () => ({ loadTensorflowModel: jest.fn() }));

import { getRgbByteOffsets, pixelDataToInputTensor } from './faceEmbedder.native';

describe('getRgbByteOffsets', () => {
  it('returns correct offsets for 4-byte formats', () => {
    expect(getRgbByteOffsets('RGBA')).toEqual({ r: 0, g: 1, b: 2, bytesPerPixel: 4 });
    expect(getRgbByteOffsets('BGRA')).toEqual({ r: 2, g: 1, b: 0, bytesPerPixel: 4 });
    expect(getRgbByteOffsets('ARGB')).toEqual({ r: 1, g: 2, b: 3, bytesPerPixel: 4 });
    expect(getRgbByteOffsets('ABGR')).toEqual({ r: 3, g: 2, b: 1, bytesPerPixel: 4 });
  });

  it('returns correct offsets for 3-byte formats', () => {
    expect(getRgbByteOffsets('RGB')).toEqual({ r: 0, g: 1, b: 2, bytesPerPixel: 3 });
    expect(getRgbByteOffsets('BGR')).toEqual({ r: 2, g: 1, b: 0, bytesPerPixel: 3 });
  });

  it('throws for an unsupported pixel format', () => {
    expect(() => getRgbByteOffsets('unknown')).toThrow(/Unsupported pixel format/);
  });
});

describe('pixelDataToInputTensor', () => {
  const MODEL_SIZE = 112;

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

  it('normalizes RGBA pixels to the MobileFaceNet (pixel - 127.5) / 128 range', () => {
    const pixelData = makeUniformPixelData('RGBA', [255, 0, 128, 255]);
    const tensor = new Float32Array(pixelDataToInputTensor(pixelData));
    expect(tensor[0]).toBeCloseTo((255 - 127.5) / 128);
    expect(tensor[1]).toBeCloseTo((0 - 127.5) / 128);
    expect(tensor[2]).toBeCloseTo((128 - 127.5) / 128);
  });

  it('correctly un-swaps BGRA channel order back to RGB', () => {
    const pixelData = makeUniformPixelData('BGRA', [10, 20, 30, 255]);
    const tensor = new Float32Array(pixelDataToInputTensor(pixelData));
    expect(tensor[0]).toBeCloseTo((10 - 127.5) / 128);
    expect(tensor[1]).toBeCloseTo((20 - 127.5) / 128);
    expect(tensor[2]).toBeCloseTo((30 - 127.5) / 128);
  });

  it('throws if the image is not already resized to the model input size', () => {
    const pixelData = makeUniformPixelData('RGBA', [0, 0, 0, 255], 1);
    expect(() => pixelDataToInputTensor(pixelData)).toThrow(/Expected a 112x112 image/);
  });
});
