/**
 * Native (Android) face-embedding implementation (task 2.4, ADR-006,
 * ADR-029) — computes a 128-d MobileFaceNet embedding from an already-
 * detected face crop, via react-native-fast-tflite. Detection itself
 * (finding a face, and cropping an Image to its bounds) is the caller's
 * responsibility using react-native-vision-camera-face-detector (task
 * 2.2) — this module's only concern is turning a face-crop `Image` into
 * a vector, matching `packages/face-matching`'s `FaceEmbedder<TImage>`
 * contract (ADR-007: this same embedding computation must be swappable
 * per platform behind one interface).
 */
import type { FaceEmbedder, FaceEmbeddingResult } from '@attendance-app/face-matching';
import type { TfliteModel } from 'react-native-fast-tflite';
import { loadTensorflowModel } from 'react-native-fast-tflite';
import type { Image } from 'react-native-nitro-image';

/**
 * `PixelFormat`/`RawPixelData` aren't re-exported from the package's public
 * entry point (only `Image` is) — derived structurally from `Image`'s own
 * method signature instead of deep-importing an internal path that isn't
 * part of the package's stable public surface.
 */
type RawPixelData = ReturnType<Image['toRawPixelData']>;
type PixelFormat = RawPixelData['pixelFormat'];

/** MobileFaceNet's fixed input resolution (ADR-029) — not configurable per-model. */
const MODEL_INPUT_SIZE = 112;

/**
 * MobileFaceNet's own training/eval preprocessing convention, verified
 * directly against `sirius-ai/MobileFaceNet_TF`'s `utils/data_process.py`
 * (`img = (img - 127.5) * 0.0078125`, RGB channel order) — not assumed. A
 * wrong constant here would silently produce meaningless embeddings
 * (every comparison would fail or succeed at random), not a visible error.
 */
const PIXEL_MEAN = 127.5;
const PIXEL_SCALE = 1 / 128;

let modelPromise: Promise<TfliteModel> | null = null;

/**
 * Loads the TFLite model once and reuses it for every subsequent call —
 * coding-standards.md requires loading ML models once at app start, not
 * per inference call.
 */
function getModel(): Promise<TfliteModel> {
  if (!modelPromise) {
    modelPromise = loadTensorflowModel(require('../../assets/models/mobilefacenet.tflite'), []);
  }
  return modelPromise;
}

/** Returns the R, G, B byte offsets (within one pixel) for a given raw `PixelFormat`. */
export function getRgbByteOffsets(pixelFormat: PixelFormat): {
  r: number;
  g: number;
  b: number;
  bytesPerPixel: number;
} {
  switch (pixelFormat) {
    case 'RGBA':
    case 'RGBX':
      return { r: 0, g: 1, b: 2, bytesPerPixel: 4 };
    case 'BGRA':
    case 'BGRX':
      return { r: 2, g: 1, b: 0, bytesPerPixel: 4 };
    case 'ARGB':
    case 'XRGB':
      return { r: 1, g: 2, b: 3, bytesPerPixel: 4 };
    case 'ABGR':
    case 'XBGR':
      return { r: 3, g: 2, b: 1, bytesPerPixel: 4 };
    case 'RGB':
      return { r: 0, g: 1, b: 2, bytesPerPixel: 3 };
    case 'BGR':
      return { r: 2, g: 1, b: 0, bytesPerPixel: 3 };
    default:
      throw new Error(`Unsupported pixel format for face embedding input: ${pixelFormat}`);
  }
}

/**
 * Converts a resized Image's raw pixel buffer into the normalized
 * `[1, 112, 112, 3]` RGB float32 tensor MobileFaceNet expects, regardless
 * of the platform's actual in-memory channel order (ARGB/BGRA/etc. —
 * `toRawPixelData()`'s format depends on OS endianness, not fixed).
 */
export function pixelDataToInputTensor(pixelData: RawPixelData): ArrayBuffer {
  const { buffer, width, height, pixelFormat } = pixelData;
  if (width !== MODEL_INPUT_SIZE || height !== MODEL_INPUT_SIZE) {
    throw new Error(
      `Expected a ${MODEL_INPUT_SIZE}x${MODEL_INPUT_SIZE} image, got ${width}x${height}`,
    );
  }

  const { r, g, b, bytesPerPixel } = getRgbByteOffsets(pixelFormat);
  const sourceBytes = new Uint8Array(buffer);
  const pixelCount = width * height;
  const tensor = new Float32Array(pixelCount * 3);

  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const sourceOffset = pixel * bytesPerPixel;
    const tensorOffset = pixel * 3;
    tensor[tensorOffset] = ((sourceBytes.at(sourceOffset + r) ?? 0) - PIXEL_MEAN) * PIXEL_SCALE;
    tensor[tensorOffset + 1] = ((sourceBytes.at(sourceOffset + g) ?? 0) - PIXEL_MEAN) * PIXEL_SCALE;
    tensor[tensorOffset + 2] = ((sourceBytes.at(sourceOffset + b) ?? 0) - PIXEL_MEAN) * PIXEL_SCALE;
  }

  return tensor.buffer;
}

/**
 * Native `FaceEmbedder` — `TImage` is a `react-native-nitro-image` `Image`
 * (from `Photo.toImage()`), expected to already be a face crop. This
 * embedder doesn't run its own detection pass; by the time it's called,
 * react-native-vision-camera-face-detector has already confirmed a face
 * is present (and task 2.7's quality gate has already screened it), so
 * `detectionConfidence` here reflects "an embedding was computed from a
 * pre-vetted crop," not a fresh detection judgment — the real per-face
 * signals (bounds, eye-openness, head angle) live on ML Kit's own `Face`
 * type and are consumed directly by the caller, not re-derived here.
 */
export const nativeFaceEmbedder: FaceEmbedder<Image> = {
  async computeEmbedding(image: Image): Promise<FaceEmbeddingResult> {
    const model = await getModel();
    const resized = image.resize(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    const pixelData = resized.toRawPixelData();
    const inputTensor = pixelDataToInputTensor(pixelData);

    const [outputBuffer] = await model.run([inputTensor]);
    if (!outputBuffer) {
      throw new Error('MobileFaceNet model produced no output tensor');
    }
    const embedding = Array.from(new Float32Array(outputBuffer));

    return { embedding, detectionConfidence: 1.0 };
  },
};
