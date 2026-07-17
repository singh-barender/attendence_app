/**
 * SSD anchor-grid generation for MediaPipe's `palm_detection_lite.tflite`
 * (ADR-031) — reimplements the subset of `SsdAnchorsCalculator`'s C++
 * algorithm (mediapipe/calculators/tflite/ssd_anchors_calculator.cc)
 * needed for this specific model's exact configuration, verified directly
 * against `palm_detection_cpu.pbtxt`'s `SsdAnchorsCalculator` options
 * (not assumed):
 *
 *   num_layers: 4, min_scale: 0.1484375, max_scale: 0.75,
 *   input_size: 192x192, anchor_offset: 0.5/0.5,
 *   strides: [8, 16, 16, 16], aspect_ratios: [1.0],
 *   fixed_anchor_size: true
 *
 * `fixed_anchor_size: true` collapses the general algorithm considerably:
 * every anchor's width/height is fixed at 1.0 (in feature-map-relative
 * units) regardless of scale/aspect-ratio, so only each anchor's
 * (x, y) center actually varies. `interpolated_scale_aspect_ratio` isn't
 * set in the pbtxt, so it takes the calculator's own default of 1.0 (> 0),
 * meaning each layer contributes *two* anchors per grid cell (one for
 * `aspect_ratios: [1.0]`, one interpolated) — confirmed empirically: this
 * is the only combination that reproduces the model's documented
 * `num_boxes: 2016` total (see `ANCHOR_COUNT_BY_STRIDE` below).
 *
 * Layer 0 uses stride 8 alone; layers 1-3 share stride 16 and are merged
 * into one feature-map pass per the calculator's "repeated stride" logic,
 * each contributing its own 2 anchors per cell. Anchors are appended in
 * the calculator's documented order — row-major (y outer, x inner), then
 * by per-cell anchor index — since the model's output tensor rows are
 * aligned to this exact order.
 */

const INPUT_SIZE = 192;
const ANCHORS_PER_CELL_PER_LAYER = 2;

const STRIDE_GROUPS: ReadonlyArray<{ readonly stride: number; readonly layerCount: number }> = [
  { stride: 8, layerCount: 1 }, // layer 0
  { stride: 16, layerCount: 3 }, // layers 1, 2, 3 (merged: same stride)
];

export interface Anchor {
  readonly xCenter: number;
  readonly yCenter: number;
}

/** Total anchor count this configuration must produce — matches the model's
 * own `num_boxes: 2016`, used as a self-check in tests rather than trusted blindly. */
export const EXPECTED_ANCHOR_COUNT = 2016;

export function generatePalmDetectionAnchors(): Anchor[] {
  const anchors: Anchor[] = [];
  for (const { stride, layerCount } of STRIDE_GROUPS) {
    const featureMapSize = Math.ceil(INPUT_SIZE / stride);
    const anchorsPerCell = layerCount * ANCHORS_PER_CELL_PER_LAYER;
    for (let y = 0; y < featureMapSize; y++) {
      const yCenter = (y + 0.5) / featureMapSize;
      for (let x = 0; x < featureMapSize; x++) {
        const xCenter = (x + 0.5) / featureMapSize;
        for (let cellAnchor = 0; cellAnchor < anchorsPerCell; cellAnchor++) {
          anchors.push({ xCenter, yCenter });
        }
      }
    }
  }
  return anchors;
}
