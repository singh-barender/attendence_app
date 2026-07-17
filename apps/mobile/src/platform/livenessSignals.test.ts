import type { LiveFaceInfo } from './faceCameraTypes';
import {
  faceToLivenessSample,
  LIVENESS_SAMPLE_WINDOW_MS,
  LivenessChallengeSession,
} from './livenessSignals';

const NO_FACE: LiveFaceInfo = {
  hasFace: false,
  faceCount: 0,
  bounds: null,
  frameWidth: 0,
  frameHeight: 0,
  yawAngle: null,
  leftEyeOpen: null,
  rightEyeOpen: null,
  smileProbability: null,
  pitchAngle: null,
  isOccluded: false,
  mouthBottom: null,
};

/** Builds a LiveFaceInfo fixture, overriding only the fields a test cares about. */
function face(overrides: Partial<LiveFaceInfo>): LiveFaceInfo {
  return { ...NO_FACE, hasFace: true, ...overrides };
}

describe('faceToLivenessSample', () => {
  it('extracts eye-openness and yaw from a detected face', () => {
    expect(
      faceToLivenessSample(
        face({
          leftEyeOpen: 0.9,
          rightEyeOpen: 0.8,
          yawAngle: 12.5,
          smileProbability: 0.4,
          pitchAngle: -3,
        }),
        1000,
      ),
    ).toEqual({
      timestampMs: 1000,
      leftEyeOpenProbability: 0.9,
      rightEyeOpenProbability: 0.8,
      yawAngleDegrees: 12.5,
      smileProbability: 0.4,
      pitchAngleDegrees: -3,
    });
  });

  it('returns all-null signal fields when no face was detected this frame', () => {
    expect(faceToLivenessSample(NO_FACE, 500)).toEqual({
      timestampMs: 500,
      leftEyeOpenProbability: null,
      rightEyeOpenProbability: null,
      yawAngleDegrees: null,
      smileProbability: null,
      pitchAngleDegrees: null,
    });
  });

  it('treats a missing classification field as null, not 0', () => {
    const result = faceToLivenessSample(face({ yawAngle: 0 }), 0);
    expect(result.leftEyeOpenProbability).toBeNull();
    expect(result.rightEyeOpenProbability).toBeNull();
    expect(result.yawAngleDegrees).toBe(0);
  });
});

describe('LivenessChallengeSession', () => {
  it('detects a completed blink across recorded frames', () => {
    const session = new LivenessChallengeSession('blink');
    session.addFrame(face({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), 0);
    session.addFrame(face({ leftEyeOpen: 0.1, rightEyeOpen: 0.1 }), 100);
    session.addFrame(face({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), 200);

    expect(session.getResult()).toEqual({ detected: true });
  });

  it('does not detect a blink from an incomplete cycle', () => {
    const session = new LivenessChallengeSession('blink');
    session.addFrame(face({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), 0);
    expect(session.getResult()).toEqual({ detected: false });
  });

  it('detects a completed head turn across recorded frames', () => {
    const session = new LivenessChallengeSession('head-turn');
    session.addFrame(face({ yawAngle: 0 }), 0);
    session.addFrame(face({ yawAngle: 30 }), 100);

    expect(session.getResult()).toEqual({ detected: true, direction: 'right' });
  });

  it('drops samples older than the retention window', () => {
    const session = new LivenessChallengeSession('head-turn', 1000);
    // Baseline far in the past, outside the window once later frames arrive.
    session.addFrame(face({ yawAngle: 0 }), 0);
    session.addFrame(face({ yawAngle: 30 }), 5000);

    // The stale baseline (t=0) was dropped, so 5000's yaw becomes the new
    // baseline on its own — no prior sample left to compare it against.
    expect(session.getResult()).toEqual({ detected: false, direction: null });
  });

  it('resets accumulated samples', () => {
    const session = new LivenessChallengeSession('blink');
    session.addFrame(face({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), 0);
    session.addFrame(face({ leftEyeOpen: 0.1, rightEyeOpen: 0.1 }), 100);
    session.reset();
    session.addFrame(face({ leftEyeOpen: 0.9, rightEyeOpen: 0.9 }), 200);

    // Without the reset, this would complete the blink cycle started above.
    expect(session.getResult()).toEqual({ detected: false });
  });

  it('defaults to LIVENESS_SAMPLE_WINDOW_MS when no window is given', () => {
    const session = new LivenessChallengeSession('head-turn');
    session.addFrame(face({ yawAngle: 0 }), 0);
    session.addFrame(face({ yawAngle: 30 }), LIVENESS_SAMPLE_WINDOW_MS - 1);
    expect(session.getResult()).toEqual({ detected: true, direction: 'right' });
  });
});
