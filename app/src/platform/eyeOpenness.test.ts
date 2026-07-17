import { CLOSED_EYE_RATIO, computeEyeOpenProbability, OPEN_EYE_RATIO } from './eyeOpenness';

/** A wide, tall contour — height/width ratio well above OPEN_EYE_RATIO. */
const WIDE_OPEN_EYE = [
  [0, 0],
  [10, 0],
  [10, 8],
  [0, 8],
] as const;

/** A wide, nearly-flat contour — height/width ratio well below CLOSED_EYE_RATIO. */
const CLOSED_EYE = [
  [0, 0],
  [10, 0],
  [10, 0.5],
  [0, 0.5],
] as const;

describe('computeEyeOpenProbability', () => {
  it('returns 1 for a clearly open eye', () => {
    expect(computeEyeOpenProbability(WIDE_OPEN_EYE)).toBe(1);
  });

  it('returns 0 for a clearly closed eye', () => {
    expect(computeEyeOpenProbability(CLOSED_EYE)).toBe(0);
  });

  it('returns null when fewer than two points are given', () => {
    expect(computeEyeOpenProbability([[0, 0]])).toBeNull();
  });

  it('returns null for a degenerate (zero-width) contour', () => {
    expect(
      computeEyeOpenProbability([
        [5, 0],
        [5, 8],
      ]),
    ).toBeNull();
  });

  it('linearly interpolates between the closed and open bounds', () => {
    const midRatio = (OPEN_EYE_RATIO + CLOSED_EYE_RATIO) / 2;
    const points = [
      [0, 0],
      [10, 0],
      [10, midRatio * 10],
      [0, midRatio * 10],
    ] as const;
    expect(computeEyeOpenProbability(points)).toBeCloseTo(0.5, 5);
  });

  it('accepts 3D points (z is ignored)', () => {
    const points = [
      [0, 0, 1],
      [10, 0, -1],
      [10, 8, 0.5],
      [0, 8, 2],
    ] as const;
    expect(computeEyeOpenProbability(points)).toBe(1);
  });
});
