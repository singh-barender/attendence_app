import type { LiveAlignmentSample } from './liveFaceAlignment';
import {
  assessLiveAlignment,
  MAX_FRONTAL_YAW_DEGREES,
  MIN_PROFILE_YAW_DEGREES,
} from './liveFaceAlignment';

const FRAME_WIDTH = 640;
const FRAME_HEIGHT = 480;

/** A well-centered, appropriately sized face bounding box for a 640x480 frame. */
const CENTERED_BOUNDS = { x: 220, y: 100, width: 200, height: 280 };

const FRONTAL_SAMPLE: LiveAlignmentSample = {
  hasFace: true,
  faceBounds: CENTERED_BOUNDS,
  frameWidth: FRAME_WIDTH,
  frameHeight: FRAME_HEIGHT,
  yawAngle: 0,
  minYawDegrees: -MAX_FRONTAL_YAW_DEGREES,
  maxYawDegrees: MAX_FRONTAL_YAW_DEGREES,
};

describe('assessLiveAlignment', () => {
  it('accepts a centered, appropriately sized, on-axis frontal frame', () => {
    expect(assessLiveAlignment(FRONTAL_SAMPLE)).toBe(true);
  });

  it('rejects when no face is present', () => {
    expect(assessLiveAlignment({ ...FRONTAL_SAMPLE, hasFace: false, faceBounds: null })).toBe(
      false,
    );
  });

  it('rejects when yaw is null (detector has not reported an angle yet)', () => {
    expect(assessLiveAlignment({ ...FRONTAL_SAMPLE, yawAngle: null })).toBe(false);
  });

  it('rejects when more than one face is in frame', () => {
    expect(assessLiveAlignment({ ...FRONTAL_SAMPLE, faceCount: 2 })).toBe(false);
  });

  it('rejects an occluded frame', () => {
    expect(assessLiveAlignment({ ...FRONTAL_SAMPLE, isOccluded: true })).toBe(false);
  });

  it('rejects a face that is too small', () => {
    expect(
      assessLiveAlignment({
        ...FRONTAL_SAMPLE,
        faceBounds: { x: 300, y: 220, width: 20, height: 20 },
      }),
    ).toBe(false);
  });

  it('rejects a face that is off-center', () => {
    expect(
      assessLiveAlignment({ ...FRONTAL_SAMPLE, faceBounds: { ...CENTERED_BOUNDS, x: 0 } }),
    ).toBe(false);
  });

  it('rejects a frontal target when yaw is turned too far to one side', () => {
    expect(assessLiveAlignment({ ...FRONTAL_SAMPLE, yawAngle: MAX_FRONTAL_YAW_DEGREES + 1 })).toBe(
      false,
    );
  });

  it('accepts a left-profile target once yaw is turned far enough negative', () => {
    const leftSample: LiveAlignmentSample = {
      ...FRONTAL_SAMPLE,
      yawAngle: -MIN_PROFILE_YAW_DEGREES,
      minYawDegrees: -Infinity,
      maxYawDegrees: -MIN_PROFILE_YAW_DEGREES,
    };
    expect(assessLiveAlignment(leftSample)).toBe(true);
    expect(assessLiveAlignment({ ...leftSample, yawAngle: -MIN_PROFILE_YAW_DEGREES + 1 })).toBe(
      false,
    );
  });

  it('accepts a right-profile target once yaw is turned far enough positive', () => {
    const rightSample: LiveAlignmentSample = {
      ...FRONTAL_SAMPLE,
      yawAngle: MIN_PROFILE_YAW_DEGREES,
      minYawDegrees: MIN_PROFILE_YAW_DEGREES,
      maxYawDegrees: Infinity,
    };
    expect(assessLiveAlignment(rightSample)).toBe(true);
    expect(assessLiveAlignment({ ...rightSample, yawAngle: MIN_PROFILE_YAW_DEGREES - 1 })).toBe(
      false,
    );
  });
});
