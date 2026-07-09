import type { FaceResult } from '@vladmandic/human';
import { eyeOpenProbabilityFrom, yawDegreesFrom } from './humanFaceExtraction.web';

/**
 * Builds a minimal fake FaceResult, overriding only the fields under test.
 * These adapters only ever read `rotation` and `annotations`, so the fixture
 * intentionally omits every other required FaceResult field rather than
 * fabricating a full, unused detection result — routed through `unknown`
 * because a partial object can never structurally satisfy the real type.
 */
function fakeFace(overrides: Record<string, unknown>): FaceResult {
  return overrides as unknown as FaceResult;
}

describe('yawDegreesFrom', () => {
  it('converts radians to degrees', () => {
    // Human's rotation.angle.yaw is in radians (Math.atan2-derived) — this
    // is the exact bug this function exists to fix: without the
    // conversion, every yaw threshold in the app (calibrated for degrees)
    // would silently be wrong by a factor of ~57.
    const face = fakeFace({ rotation: { angle: { yaw: Math.PI / 2, pitch: 0, roll: 0 } } });
    expect(yawDegreesFrom(face)).toBeCloseTo(90, 5);
  });

  it('converts a negative yaw correctly', () => {
    const face = fakeFace({ rotation: { angle: { yaw: -Math.PI / 4, pitch: 0, roll: 0 } } });
    expect(yawDegreesFrom(face)).toBeCloseTo(-45, 5);
  });

  it('returns 0 for a zero yaw (not null)', () => {
    const face = fakeFace({ rotation: { angle: { yaw: 0, pitch: 0, roll: 0 } } });
    expect(yawDegreesFrom(face)).toBe(0);
  });

  it('returns null when rotation is missing', () => {
    expect(yawDegreesFrom(fakeFace({}))).toBeNull();
  });

  it('returns null when rotation is null', () => {
    expect(yawDegreesFrom(fakeFace({ rotation: null }))).toBeNull();
  });
});

describe('eyeOpenProbabilityFrom', () => {
  const WIDE_OPEN_CONTOUR = [
    [0, 0],
    [10, 0],
  ];
  const TALL_CONTOUR = [
    [0, 8],
    [10, 8],
  ];

  it('combines upper and lower eyelid contours into one point set', () => {
    const face = fakeFace({
      annotations: {
        leftEyeUpper0: WIDE_OPEN_CONTOUR,
        leftEyeLower0: TALL_CONTOUR,
      },
    });
    // Combined bounding box: x 0-10, y 0-8 -> ratio 0.8, well above
    // OPEN_EYE_RATIO -> fully open.
    expect(eyeOpenProbabilityFrom(face, 'leftEyeUpper0', 'leftEyeLower0')).toBe(1);
  });

  it('returns null when both contour keys are missing', () => {
    const face = fakeFace({ annotations: {} });
    expect(eyeOpenProbabilityFrom(face, 'leftEyeUpper0', 'leftEyeLower0')).toBeNull();
  });

  it('reads the correct annotation keys for the requested eye', () => {
    const face = fakeFace({
      annotations: {
        leftEyeUpper0: WIDE_OPEN_CONTOUR,
        leftEyeLower0: TALL_CONTOUR,
        // Right eye deliberately has a degenerate (flat) contour, to
        // confirm the function reads the *requested* eye's keys, not the
        // other one.
        rightEyeUpper0: [
          [0, 0],
          [10, 0],
        ],
        rightEyeLower0: [
          [0, 0.1],
          [10, 0.1],
        ],
      },
    });
    expect(eyeOpenProbabilityFrom(face, 'leftEyeUpper0', 'leftEyeLower0')).toBe(1);
    expect(eyeOpenProbabilityFrom(face, 'rightEyeUpper0', 'rightEyeLower0')).toBe(0);
  });
});
