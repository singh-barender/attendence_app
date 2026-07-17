import type { EnrollmentQualitySample } from './enrollmentQuality';
import {
  assessEnrollmentQuality,
  MAX_BRIGHTNESS,
  MAX_CENTER_OFFSET_RATIO,
  MAX_FACE_SIZE_RATIO,
  MIN_BRIGHTNESS,
  MIN_FACE_SIZE_RATIO,
  MIN_MOUTH_SHARPNESS_RATIO,
  MIN_SHARPNESS_SCORE,
} from './enrollmentQuality';

const FRAME_WIDTH = 640;
const FRAME_HEIGHT = 480;

/** A well-centered, appropriately sized face bounding box for a 640x480 frame. */
const CENTERED_BOUNDS = { x: 220, y: 100, width: 200, height: 280 };

const GOOD_SAMPLE: EnrollmentQualitySample = {
  hasFace: true,
  faceBounds: CENTERED_BOUNDS,
  frameWidth: FRAME_WIDTH,
  frameHeight: FRAME_HEIGHT,
  averageBrightness: (MIN_BRIGHTNESS + MAX_BRIGHTNESS) / 2,
  sharpnessScore: MIN_SHARPNESS_SCORE + 5,
};

describe('assessEnrollmentQuality', () => {
  it('accepts a well-lit, in-focus, centered capture', () => {
    const result = assessEnrollmentQuality(GOOD_SAMPLE);
    expect(result).toEqual({ accepted: true, reason: null, message: null });
  });

  it('rejects when no face was detected', () => {
    const result = assessEnrollmentQuality({ ...GOOD_SAMPLE, hasFace: false, faceBounds: null });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('no-face');
    expect(result.message).toBeTruthy();
  });

  it('rejects when hasFace is true but bounds are missing', () => {
    const result = assessEnrollmentQuality({ ...GOOD_SAMPLE, faceBounds: null });
    expect(result.reason).toBe('no-face');
  });

  it('rejects when more than one face is in frame', () => {
    const result = assessEnrollmentQuality({ ...GOOD_SAMPLE, faceCount: 2 });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('multiple-faces');
    expect(result.message).toBeTruthy();
  });

  it('rejects when a hand/object is detected near the face, taking priority over other checks', () => {
    const result = assessEnrollmentQuality({
      ...GOOD_SAMPLE,
      handDetected: true,
      averageBrightness: 0, // also too-dark — hand-detected must still win
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('hand-detected');
    expect(result.message).toBeTruthy();
  });

  it('accepts when handDetected is false/omitted', () => {
    expect(assessEnrollmentQuality({ ...GOOD_SAMPLE, handDetected: false }).accepted).toBe(true);
    expect(assessEnrollmentQuality(GOOD_SAMPLE).accepted).toBe(true);
  });

  it('accepts a single-face capture (faceCount 1)', () => {
    expect(assessEnrollmentQuality({ ...GOOD_SAMPLE, faceCount: 1 }).accepted).toBe(true);
  });

  it('rejects a too-dark capture', () => {
    const result = assessEnrollmentQuality({
      ...GOOD_SAMPLE,
      averageBrightness: MIN_BRIGHTNESS - 1,
    });
    expect(result.reason).toBe('too-dark');
  });

  it('rejects a too-bright/washed-out capture', () => {
    const result = assessEnrollmentQuality({
      ...GOOD_SAMPLE,
      averageBrightness: MAX_BRIGHTNESS + 1,
    });
    expect(result.reason).toBe('too-bright');
  });

  it('accepts brightness exactly at the min/max boundaries', () => {
    expect(
      assessEnrollmentQuality({ ...GOOD_SAMPLE, averageBrightness: MIN_BRIGHTNESS }).accepted,
    ).toBe(true);
    expect(
      assessEnrollmentQuality({ ...GOOD_SAMPLE, averageBrightness: MAX_BRIGHTNESS }).accepted,
    ).toBe(true);
  });

  it('rejects a too-blurry capture', () => {
    const result = assessEnrollmentQuality({
      ...GOOD_SAMPLE,
      sharpnessScore: MIN_SHARPNESS_SCORE - 0.1,
    });
    expect(result.reason).toBe('too-blurry');
  });

  it('rejects a face that is too small (too far from the camera)', () => {
    const shorterSide = Math.min(FRAME_WIDTH, FRAME_HEIGHT);
    const tooSmall = Math.floor(shorterSide * MIN_FACE_SIZE_RATIO) - 1;
    const result = assessEnrollmentQuality({
      ...GOOD_SAMPLE,
      faceBounds: { x: 300, y: 220, width: tooSmall, height: tooSmall },
    });
    expect(result.reason).toBe('too-small');
  });

  it('rejects a face that is too close (fills more than the max frame ratio)', () => {
    const shorterSide = Math.min(FRAME_WIDTH, FRAME_HEIGHT);
    const tooClose = Math.ceil(shorterSide * MAX_FACE_SIZE_RATIO) + 1;
    const x = (FRAME_WIDTH - tooClose) / 2;
    const y = (FRAME_HEIGHT - tooClose) / 2;
    const result = assessEnrollmentQuality({
      ...GOOD_SAMPLE,
      faceBounds: { x, y, width: tooClose, height: tooClose },
    });
    expect(result.reason).toBe('too-close');
  });

  it('accepts a face right at the max-size boundary', () => {
    const shorterSide = Math.min(FRAME_WIDTH, FRAME_HEIGHT);
    const atLimit = Math.floor(shorterSide * MAX_FACE_SIZE_RATIO);
    const x = (FRAME_WIDTH - atLimit) / 2;
    const y = (FRAME_HEIGHT - atLimit) / 2;
    const result = assessEnrollmentQuality({
      ...GOOD_SAMPLE,
      faceBounds: { x, y, width: atLimit, height: atLimit },
    });
    expect(result.accepted).toBe(true);
  });

  it('rejects if eyes are closed', () => {
    const result = assessEnrollmentQuality({
      ...GOOD_SAMPLE,
      leftEyeOpen: 0.1,
      rightEyeOpen: 0.1,
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('eyes-closed');
  });

  it('rejects when the mouth region is far smoother than the rest of the face (likely a hand/object covering it)', () => {
    const result = assessEnrollmentQuality({
      ...GOOD_SAMPLE,
      mouthRegionSharpnessRatio: MIN_MOUTH_SHARPNESS_RATIO - 0.01,
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('occluded');
  });

  it('accepts a mouth-region sharpness ratio at/above the floor, and a null ratio (not available)', () => {
    expect(
      assessEnrollmentQuality({
        ...GOOD_SAMPLE,
        mouthRegionSharpnessRatio: MIN_MOUTH_SHARPNESS_RATIO,
      }).accepted,
    ).toBe(true);
    expect(
      assessEnrollmentQuality({ ...GOOD_SAMPLE, mouthRegionSharpnessRatio: null }).accepted,
    ).toBe(true);
  });

  it('rejects a face that is off-center horizontally', () => {
    const result = assessEnrollmentQuality({
      ...GOOD_SAMPLE,
      faceBounds: { ...CENTERED_BOUNDS, x: 0 },
    });
    expect(result.reason).toBe('off-center');
  });

  it('rejects a face that is off-center vertically', () => {
    const result = assessEnrollmentQuality({
      ...GOOD_SAMPLE,
      faceBounds: { ...CENTERED_BOUNDS, y: FRAME_HEIGHT - 10 },
    });
    expect(result.reason).toBe('off-center');
  });

  it('accepts a face right at the edge of the centering tolerance', () => {
    // Places the face center exactly MAX_CENTER_OFFSET_RATIO * frameWidth away
    // from true center — the boundary check is `>`, so exactly-at-the-limit
    // must still be accepted, not rejected.
    const width = CENTERED_BOUNDS.width;
    const faceCenterX = FRAME_WIDTH / 2 + FRAME_WIDTH * MAX_CENTER_OFFSET_RATIO;
    const x = faceCenterX - width / 2;
    const result = assessEnrollmentQuality({
      ...GOOD_SAMPLE,
      faceBounds: { ...CENTERED_BOUNDS, x },
    });
    expect(result.accepted).toBe(true);
  });

  it('checks reasons in a fixed priority order when multiple issues are present', () => {
    // No face present AND too dark — no-face must win since presence is checked first.
    const result = assessEnrollmentQuality({
      ...GOOD_SAMPLE,
      hasFace: false,
      faceBounds: null,
      averageBrightness: 0,
    });
    expect(result.reason).toBe('no-face');
  });
});
