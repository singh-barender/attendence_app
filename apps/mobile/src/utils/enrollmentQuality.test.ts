import type { EnrollmentQualitySample } from './enrollmentQuality';
import {
  assessEnrollmentQuality,
  MAX_BRIGHTNESS,
  MAX_CENTER_OFFSET_RATIO,
  MIN_BRIGHTNESS,
  MIN_FACE_SIZE_RATIO,
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
