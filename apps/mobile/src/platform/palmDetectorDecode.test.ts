import { decodeDetections, MIN_SCORE_THRESH, nonMaxSuppression } from './palmDetectorDecode';

/** Builds a raw-box row (18 floats) with only x/y/w/h set, keypoints zeroed. */
function boxRow(x: number, y: number, w: number, h: number): number[] {
  return [x, y, w, h, ...new Array(14).fill(0)];
}

/** Inverse of the sigmoid used in decodeDetections, so tests can specify a target probability directly. */
function logit(probability: number): number {
  return Math.log(probability / (1 - probability));
}

describe('decodeDetections', () => {
  it('decodes a box centered exactly on its anchor when raw x/y/w/h are zero', () => {
    const anchors = [{ xCenter: 0.5, yCenter: 0.5 }];
    const rawBoxes = new Float32Array(boxRow(0, 0, 0, 0));
    const rawScores = new Float32Array([logit(0.9)]);

    const [detection] = decodeDetections(rawBoxes, rawScores, anchors);
    expect(detection?.xMin).toBeCloseTo(0.5);
    expect(detection?.xMax).toBeCloseTo(0.5);
    expect(detection?.score).toBeCloseTo(0.9, 2);
  });

  it('applies raw x/y/w/h scaled by 192, relative to the anchor center', () => {
    const anchors = [{ xCenter: 0.5, yCenter: 0.5 }];
    // raw x=19.2 -> 19.2/192 = 0.1 offset; raw w=38.4 -> 38.4/192 = 0.2 width.
    const rawBoxes = new Float32Array(boxRow(19.2, 0, 38.4, 19.2));
    const rawScores = new Float32Array([logit(0.9)]);

    const [detection] = decodeDetections(rawBoxes, rawScores, anchors);
    const expectedXCenter = 0.5 + 0.1;
    const expectedWidth = 0.2;
    expect(detection?.xMin).toBeCloseTo(expectedXCenter - expectedWidth / 2);
    expect(detection?.xMax).toBeCloseTo(expectedXCenter + expectedWidth / 2);
  });

  it('drops detections below MIN_SCORE_THRESH', () => {
    const anchors = [{ xCenter: 0.5, yCenter: 0.5 }];
    const rawBoxes = new Float32Array(boxRow(0, 0, 0, 0));
    const rawScores = new Float32Array([logit(MIN_SCORE_THRESH - 0.01)]);

    expect(decodeDetections(rawBoxes, rawScores, anchors)).toHaveLength(0);
  });

  it('keeps a detection at/above MIN_SCORE_THRESH', () => {
    const anchors = [{ xCenter: 0.5, yCenter: 0.5 }];
    const rawBoxes = new Float32Array(boxRow(0, 0, 0, 0));
    // A hair above the threshold, not exactly at it: logit() round-tripped
    // through a Float32Array loses enough precision at non-zero values that
    // an "exactly at threshold" case can land a hair under it, which is a
    // test-precision artifact, not a real boundary bug (only threshold 0.5,
    // whose logit is exactly 0, round-trips exactly).
    const rawScores = new Float32Array([logit(MIN_SCORE_THRESH + 0.001)]);

    expect(decodeDetections(rawBoxes, rawScores, anchors)).toHaveLength(1);
  });

  it('decodes multiple anchors independently, in order', () => {
    const anchors = [
      { xCenter: 0.2, yCenter: 0.2 },
      { xCenter: 0.8, yCenter: 0.8 },
    ];
    const rawBoxes = new Float32Array([...boxRow(0, 0, 0, 0), ...boxRow(0, 0, 0, 0)]);
    const rawScores = new Float32Array([logit(0.9), logit(0.95)]);

    const detections = decodeDetections(rawBoxes, rawScores, anchors);
    expect(detections).toHaveLength(2);
    expect(detections[0]?.xMin).toBeCloseTo(0.2);
    expect(detections[1]?.xMin).toBeCloseTo(0.8);
  });
});

describe('nonMaxSuppression', () => {
  it('keeps both detections when they do not overlap', () => {
    const a = { score: 0.9, xMin: 0, yMin: 0, xMax: 0.1, yMax: 0.1 };
    const b = { score: 0.8, xMin: 0.5, yMin: 0.5, xMax: 0.6, yMax: 0.6 };

    expect(nonMaxSuppression([a, b])).toEqual([a, b]);
  });

  it('suppresses the lower-scoring detection when two heavily overlap', () => {
    const a = { score: 0.9, xMin: 0, yMin: 0, xMax: 0.2, yMax: 0.2 };
    const b = { score: 0.95, xMin: 0.01, yMin: 0.01, xMax: 0.21, yMax: 0.21 };

    expect(nonMaxSuppression([a, b])).toEqual([b]);
  });

  it('keeps both detections when IoU is below the threshold', () => {
    const a = { score: 0.9, xMin: 0, yMin: 0, xMax: 0.2, yMax: 0.2 };
    // Overlaps only a sliver of `a` — IoU well under the 0.3 default threshold.
    const b = { score: 0.85, xMin: 0.19, yMin: 0.19, xMax: 0.4, yMax: 0.4 };

    expect(nonMaxSuppression([a, b])).toEqual([a, b]);
  });

  it('returns an empty array for no input', () => {
    expect(nonMaxSuppression([])).toEqual([]);
  });
});
