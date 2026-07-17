/**
 * Native (Android) hand/palm detection (ADR-031) — a dedicated signal for
 * "is a hand or object held in front of the face," added after four
 * independent attempts at inferring occlusion purely from ML Kit's face
 * landmarks (presence, geometry-plausibility, mouth-region pixel texture,
 * broadened landmark presence — `faceCamera.native.tsx`) all failed
 * against a real hand held steadily over the mouth/nose: ML Kit's face
 * mesh is deliberately trained to stay robust under exactly this kind of
 * partial occlusion, so none of those signals could reliably tell a real
 * mouth from a hand covering it. This runs a genuinely different, dedicated
 * detector instead of trying to squeeze more out of the same signal family.
 *
 * Uses `palm_detection_lite.tflite` (Google's MediaPipe project, its
 * "Legacy Solutions" line — superseded by the newer MediaPipe Tasks bundle
 * format, but still hosted/working and a standalone TFLite file, unlike the
 * Tasks bundle which needs the separate MediaPipe Tasks Android SDK) via
 * the SAME `react-native-fast-tflite` runtime `faceEmbedder.native.ts`
 * already uses — no new native dependency, just a second model file.
 *
 * This raw model only outputs anchor-relative regression tensors; MediaPipe
 * normally decodes these via surrounding C++ calculators this app doesn't
 * use. `palmDetectorAnchors.ts`/`palmDetectorDecode.ts` reimplement that
 * decoding, verified line-by-line against MediaPipe's own calculator source
 * (see those files' doc comments) rather than guessed.
 */
import type { TfliteModel } from 'react-native-fast-tflite';
import { loadTensorflowModel } from 'react-native-fast-tflite';
import type { Image } from 'react-native-nitro-image';
import type { FaceBounds } from '../utils/enrollmentQuality';
import { mapFaceBoundsToCropRect } from '../utils/faceCrop';
import { getRgbByteOffsets } from './faceEmbedder';
import type { Anchor } from './palmDetectorAnchors';
import { generatePalmDetectionAnchors } from './palmDetectorAnchors';
import { type Detection, decodeDetections, nonMaxSuppression } from './palmDetectorDecode';

type RawPixelData = ReturnType<Image['toRawPixelData']>;

/** Margin around the detected face bounds used specifically for the
 * hand-detection crop (ADR-031) — deliberately much larger than
 * `FACE_CROP_MARGIN_RATIO` (used for the embedder's own face crop): a hand
 * covering the face typically extends well past the face's own bounding
 * box (fingers/wrist visible beyond the jaw/forehead), and cropping to a
 * generous region around the face — rather than running detection on the
 * entire photo — keeps the palm detector's fixed 192x192 input at a much
 * higher effective resolution on the region that actually matters. Because
 * detection only ever runs on this face-centered region, "a hand was
 * detected at all" already means "near the face" — no separate overlap
 * check against the face bounds is needed. */
const HAND_DETECTION_CROP_MARGIN_RATIO = 0.6;

/** `palm_detection_lite.tflite`'s fixed input resolution — verified against
 * `palm_detection_cpu.pbtxt`'s `ImageToTensorCalculator` options. */
const MODEL_INPUT_SIZE = 192;

/**
 * MediaPipe's own preprocessing normalizes to [0.0, 1.0] (a plain divide by
 * 255) — verified against `palm_detection_cpu.pbtxt`'s
 * `output_tensor_float_range`, not assumed from MobileFaceNet's different
 * ([-1, 1]-equivalent) convention (ADR-029's `PIXEL_MEAN`/`PIXEL_SCALE`).
 */
const PIXEL_SCALE = 1 / 255;

let modelPromise: Promise<TfliteModel> | null = null;
let cachedAnchors: Anchor[] | null = null;

function getModel(): Promise<TfliteModel> {
  if (!modelPromise) {
    modelPromise = loadTensorflowModel(
      require('../../assets/models/palm_detection_lite.tflite'),
      [],
    );
  }
  return modelPromise;
}

function getAnchors(): Anchor[] {
  if (!cachedAnchors) {
    cachedAnchors = generatePalmDetectionAnchors();
  }
  return cachedAnchors;
}

/** Converts a resized image's raw pixel buffer into the [0,1]-normalized
 * `[1, 192, 192, 3]` RGB float32 tensor the palm detector expects. */
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
    tensor[tensorOffset] = (sourceBytes.at(sourceOffset + r) ?? 0) * PIXEL_SCALE;
    tensor[tensorOffset + 1] = (sourceBytes.at(sourceOffset + g) ?? 0) * PIXEL_SCALE;
    tensor[tensorOffset + 2] = (sourceBytes.at(sourceOffset + b) ?? 0) * PIXEL_SCALE;
  }

  return tensor.buffer;
}

const EXPECTED_BOX_TENSOR_LENGTH = generatePalmDetectionAnchors().length * 18;
const EXPECTED_SCORE_TENSOR_LENGTH = generatePalmDetectionAnchors().length;

/**
 * Runs the palm detector on `image` (the caller decides what region —
 * `faceCamera.native.tsx` passes a generously-margined crop around the
 * detected face, not the whole photo, so the model sees the region at
 * higher effective resolution and a "hand detected" result inherently
 * means "near the face," with no separate overlap check needed) and
 * returns the highest-confidence detection, or `null` if none clears the
 * model's own confidence threshold.
 *
 * Deliberately uses a plain (non-aspect-preserving) resize rather than
 * MediaPipe's own letterboxed preprocessing (`keep_aspect_ratio: true`) —
 * a simplification accepted for this defensive/secondary signal (not the
 * app's primary security boundary, ADR-007), trading a little detection
 * accuracy on non-square crops for avoiding letterbox-coordinate bookkeeping.
 */
export async function detectHand(image: Image): Promise<Detection | null> {
  const model = await getModel();
  const resized = image.resize(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const pixelData = resized.toRawPixelData();
  const inputTensor = pixelDataToInputTensor(pixelData);

  const outputs = await model.run([inputTensor]);
  const boxesBuffer = outputs.find(
    (buf) => buf.byteLength / Float32Array.BYTES_PER_ELEMENT === EXPECTED_BOX_TENSOR_LENGTH,
  );
  const scoresBuffer = outputs.find(
    (buf) => buf.byteLength / Float32Array.BYTES_PER_ELEMENT === EXPECTED_SCORE_TENSOR_LENGTH,
  );
  if (!boxesBuffer || !scoresBuffer) {
    throw new Error(
      `Unexpected palm-detection model output shape: got byte lengths [${outputs
        .map((buf) => buf.byteLength)
        .join(', ')}]`,
    );
  }

  const rawBoxes = new Float32Array(boxesBuffer);
  const rawScores = new Float32Array(scoresBuffer);
  const detections = decodeDetections(rawBoxes, rawScores, getAnchors());
  const kept = nonMaxSuppression(detections);
  if (kept.length === 0) {
    return null;
  }
  return kept.reduce((best, candidate) => (candidate.score > best.score ? candidate : best));
}

/**
 * Crops `image` to a generously-margined region around `faceBounds` (frame
 * space) and runs the palm detector on it — the full "is a hand near the
 * face" check `faceCamera.native.tsx`'s `capture()` needs, split out so that
 * call site only has to make one call rather than re-deriving the crop
 * math itself.
 */
export async function checkHandNearFace(
  faceBounds: FaceBounds | null,
  frameWidth: number,
  frameHeight: number,
  image: Image,
): Promise<boolean> {
  if (!faceBounds) {
    return false;
  }
  const cropRect = mapFaceBoundsToCropRect(
    faceBounds,
    frameWidth,
    frameHeight,
    image.width,
    image.height,
    HAND_DETECTION_CROP_MARGIN_RATIO,
  );
  const region = image.crop(cropRect.startX, cropRect.startY, cropRect.endX, cropRect.endY);
  return (await detectHand(region)) !== null;
}
