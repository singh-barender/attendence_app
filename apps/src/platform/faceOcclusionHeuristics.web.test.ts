import type { FaceResult } from '@vladmandic/human';
import { computeFaceOcclusion } from './faceOcclusionHeuristics.web';

/**
 * Builds a minimal fake FaceResult, overriding only the fields under test —
 * same rationale/pattern as humanFaceExtraction.web.test.ts's fakeFace: this
 * function only ever reads `box` and `annotations`.
 */
function fakeFace(overrides: Record<string, unknown>): FaceResult {
  return overrides as unknown as FaceResult;
}

// A 100x100 face box with a plausible, unoccluded lower-face geometry: nose
// sits at y=50, mouth spans y=65-70 (gap 15, 15% of height) and x=40-60
// (width 20, 20% of width) — comfortably above both 5% thresholds.
const PLAUSIBLE_FACE = fakeFace({
  box: [0, 0, 100, 100],
  annotations: {
    noseBottom: [[50, 50]],
    mouth: [
      [40, 65],
      [60, 65],
      [50, 70],
    ],
  },
});

describe('computeFaceOcclusion', () => {
  it('returns not-occluded and a null mouthBottom when there is no face', () => {
    expect(computeFaceOcclusion(undefined)).toEqual({ isOccluded: false, mouthBottom: null });
  });

  it('fails closed (occluded) when a detected face has no mappable mouth/nose contour', () => {
    // Human's fixed-topology mesh always populates every annotation group
    // for any detected face, so an unmappable mouth/nose here is treated as
    // a real signal, not a benign gap — the reverse of "not itself
    // occlusion" would let a fully-masked lower face through unchecked.
    const face = fakeFace({ box: [0, 0, 100, 100], annotations: {} });
    expect(computeFaceOcclusion(face)).toEqual({ isOccluded: true, mouthBottom: null });
  });

  it('accepts a plausible, unoccluded lower-face geometry', () => {
    const result = computeFaceOcclusion(PLAUSIBLE_FACE);
    expect(result.isOccluded).toBe(false);
    expect(result.mouthBottom).toEqual({ x: 50, y: 70 });
  });

  it('flags occlusion when the nose-to-mouth gap collapses (e.g. a hand over the mouth)', () => {
    const face = fakeFace({
      box: [0, 0, 100, 100],
      annotations: {
        noseBottom: [[50, 50]],
        // Mouth estimate sitting almost on top of the nose — gap of 2,
        // well under the 5-ratio-point (5) minimum for a 100-tall box.
        mouth: [
          [40, 52],
          [60, 52],
          [50, 52],
        ],
      },
    });
    const result = computeFaceOcclusion(face);
    expect(result.isOccluded).toBe(true);
    // All three points tie at y=52 — extremePoint's reduce keeps the first
    // on a tie, so the reported mouthBottom is the first array entry, not
    // necessarily the visually "middle" one.
    expect(result.mouthBottom).toEqual({ x: 40, y: 52 });
  });

  it('flags occlusion when the mouth corners collapse onto each other', () => {
    const face = fakeFace({
      box: [0, 0, 100, 100],
      annotations: {
        noseBottom: [[50, 50]],
        // Mouth corners only 2 units apart — under the 5-ratio-point (5)
        // minimum for a 100-wide box, despite a plausible vertical gap.
        mouth: [
          [49, 65],
          [51, 65],
          [50, 70],
        ],
      },
    });
    const result = computeFaceOcclusion(face);
    expect(result.isOccluded).toBe(true);
  });

  it('reads the extreme mouth-contour points regardless of their order in the array', () => {
    const face = fakeFace({
      box: [0, 0, 100, 100],
      annotations: {
        noseBottom: [[50, 50]],
        mouth: [
          [50, 70],
          [60, 65],
          [40, 65],
        ],
      },
    });
    const result = computeFaceOcclusion(face);
    expect(result.mouthBottom).toEqual({ x: 50, y: 70 });
    expect(result.isOccluded).toBe(false);
  });
});
