/**
 * Raw-tensor decoding for MediaPipe's `palm_detection_lite.tflite`
 * (ADR-031) — reimplements the subset of `TensorsToDetectionsCalculator`'s
 * C++ logic (mediapipe/calculators/tensor/tensors_to_detections_calculator.cc)
 * needed to turn this model's raw output tensors into usable bounding
 * boxes, verified directly against `palm_detection_cpu.pbtxt`'s
 * `TensorsToDetectionsCalculator` options (not assumed):
 *
 *   num_boxes: 2016, num_coords: 18, box_coord_offset: 0,
 *   sigmoid_score: true, score_clipping_thresh: 100.0,
 *   reverse_output_order: true, x/y/w/h_scale: 192.0,
 *   min_score_thresh: 0.5
 *
 * `reverse_output_order: true` means each raw box row is laid out
 * `[x_center, y_center, w, h, ...14 keypoint values]` (the calculator's
 * "XYWH" case), not the default y-first layout — this module only decodes
 * the box (not the 7 keypoints); keypoints aren't needed to answer "is a
 * hand/object present here," so decoding them would be unused surface
 * area, not a simplification worth skipping verification for elsewhere.
 * `apply_exponential_on_box_size` isn't set (defaults to false), so width/
 * height use the calculator's plain linear-scaling branch, not the
 * exponential one.
 *
 * Because the anchors this model uses have `fixed_anchor_size: true`
 * (`palmDetectorAnchors.ts`), every anchor's own width/height is exactly
 * 1.0, which simplifies the calculator's general
 * `raw / scale * anchor.w + anchor.center` formula to `raw / scale +
 * anchor.center` below — this is that same formula with the constant
 * anchor.w/h factored out, not a different one.
 */
import type { Anchor } from './palmDetectorAnchors';

const NUM_COORDS = 18;
const BOX_COORD_OFFSET = 0;
const X_SCALE = 192;
const Y_SCALE = 192;
const W_SCALE = 192;
const H_SCALE = 192;
const SCORE_CLIPPING_THRESH = 100;

/** Below this confidence, a candidate detection is discarded. MediaPipe's own
 * documented `min_score_thresh` is 0.5, tuned for its original continuous
 * hand-tracking use case (scanning a whole live frame for a hand anywhere in
 * it). This app's use case is narrower and already favors recall: a single
 * post-capture inference on a generously-margined crop already centered on
 * the face (see `HAND_DETECTION_CROP_MARGIN_RATIO`), where a real on-device
 * capture of a hand held over the mouth/nose scored 0.45 (sigmoid) — clearly
 * a genuine detection (background/no-hand frames scored 0.07-0.08 on the same
 * device, a wide separation), just under MediaPipe's stock cutoff. Lowered
 * to keep meaningful headroom under that measured no-hand baseline while
 * still comfortably catching the measured hand-present case (ADR-031). */
export const MIN_SCORE_THRESH = 0.35;
/** IoU at/above this is treated as "the same detection" during
 * suppression — matches the model's own documented NMS threshold. */
export const NMS_IOU_THRESHOLD = 0.3;

export interface Detection {
  readonly score: number;
  readonly xMin: number;
  readonly yMin: number;
  readonly xMax: number;
  readonly yMax: number;
}

function sigmoid(rawScore: number): number {
  const clipped = Math.max(-SCORE_CLIPPING_THRESH, Math.min(SCORE_CLIPPING_THRESH, rawScore));
  return 1 / (1 + Math.exp(-clipped));
}

/**
 * Decodes raw box regressions + scores into normalized ([0,1], relative to
 * the model's 192x192 input) detections, dropping anything below
 * `MIN_SCORE_THRESH` up front — matches `TensorsToDetectionsCalculator`
 * filtering low-confidence candidates before NMS ever sees them.
 */
export function decodeDetections(
  rawBoxes: Float32Array,
  rawScores: Float32Array,
  anchors: readonly Anchor[],
): Detection[] {
  const detections: Detection[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const score = sigmoid(rawScores[i] ?? 0);
    if (score < MIN_SCORE_THRESH) {
      continue;
    }
    const anchor = anchors[i];
    if (!anchor) {
      continue;
    }
    const boxOffset = i * NUM_COORDS + BOX_COORD_OFFSET;
    const rawX = rawBoxes[boxOffset] ?? 0;
    const rawY = rawBoxes[boxOffset + 1] ?? 0;
    const rawW = rawBoxes[boxOffset + 2] ?? 0;
    const rawH = rawBoxes[boxOffset + 3] ?? 0;

    const xCenter = rawX / X_SCALE + anchor.xCenter;
    const yCenter = rawY / Y_SCALE + anchor.yCenter;
    const width = rawW / W_SCALE;
    const height = rawH / H_SCALE;

    detections.push({
      score,
      xMin: xCenter - width / 2,
      yMin: yCenter - height / 2,
      xMax: xCenter + width / 2,
      yMax: yCenter + height / 2,
    });
  }
  return detections;
}

function intersectionOverUnion(a: Detection, b: Detection): number {
  const interXMin = Math.max(a.xMin, b.xMin);
  const interYMin = Math.max(a.yMin, b.yMin);
  const interXMax = Math.min(a.xMax, b.xMax);
  const interYMax = Math.min(a.yMax, b.yMax);
  const interWidth = Math.max(0, interXMax - interXMin);
  const interHeight = Math.max(0, interYMax - interYMin);
  const interArea = interWidth * interHeight;

  const areaA = Math.max(0, a.xMax - a.xMin) * Math.max(0, a.yMax - a.yMin);
  const areaB = Math.max(0, b.xMax - b.xMin) * Math.max(0, b.yMax - b.yMin);
  const unionArea = areaA + areaB - interArea;

  return unionArea > 0 ? interArea / unionArea : 0;
}

/**
 * Greedy IoU-based non-max suppression — matches
 * `NonMaxSuppressionCalculator`'s `overlap_type: INTERSECTION_OVER_UNION`
 * with `min_suppression_threshold: 0.3`. Highest-scoring detections are
 * kept first; any later, lower-scoring detection overlapping an
 * already-kept one by >= the threshold is discarded as a duplicate of the
 * same hand.
 */
export function nonMaxSuppression(
  detections: readonly Detection[],
  iouThreshold: number = NMS_IOU_THRESHOLD,
): Detection[] {
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const candidate of sorted) {
    const overlapsKept = kept.some(
      (keptDetection) => intersectionOverUnion(keptDetection, candidate) >= iouThreshold,
    );
    if (!overlapsKept) {
      kept.push(candidate);
    }
  }
  return kept;
}
