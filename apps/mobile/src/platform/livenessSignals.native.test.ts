import {
  faceToLivenessSample,
  LIVENESS_SAMPLE_WINDOW_MS,
  LivenessChallengeSession,
} from './livenessSignals.native';

describe('faceToLivenessSample', () => {
  it('extracts eye-openness and yaw from a detected face', () => {
    const face = {
      leftEyeOpenProbability: 0.9,
      rightEyeOpenProbability: 0.8,
      yawAngle: 12.5,
    } as Parameters<typeof faceToLivenessSample>[0];

    expect(faceToLivenessSample(face, 1000)).toEqual({
      timestampMs: 1000,
      leftEyeOpenProbability: 0.9,
      rightEyeOpenProbability: 0.8,
      yawAngleDegrees: 12.5,
    });
  });

  it('returns all-null signal fields when no face was detected this frame', () => {
    expect(faceToLivenessSample(undefined, 500)).toEqual({
      timestampMs: 500,
      leftEyeOpenProbability: null,
      rightEyeOpenProbability: null,
      yawAngleDegrees: null,
    });
  });

  it('treats a missing (undefined) classification field as null, not 0', () => {
    const face = { yawAngle: 0 } as Parameters<typeof faceToLivenessSample>[0];
    const result = faceToLivenessSample(face, 0);
    expect(result.leftEyeOpenProbability).toBeNull();
    expect(result.rightEyeOpenProbability).toBeNull();
    expect(result.yawAngleDegrees).toBe(0);
  });
});

describe('LivenessChallengeSession', () => {
  it('detects a completed blink across recorded frames', () => {
    const session = new LivenessChallengeSession('blink');
    session.addFrame(
      { leftEyeOpenProbability: 0.9, rightEyeOpenProbability: 0.9 } as Parameters<
        typeof faceToLivenessSample
      >[0],
      0,
    );
    session.addFrame(
      { leftEyeOpenProbability: 0.1, rightEyeOpenProbability: 0.1 } as Parameters<
        typeof faceToLivenessSample
      >[0],
      100,
    );
    session.addFrame(
      { leftEyeOpenProbability: 0.9, rightEyeOpenProbability: 0.9 } as Parameters<
        typeof faceToLivenessSample
      >[0],
      200,
    );

    expect(session.getResult()).toEqual({ detected: true });
  });

  it('does not detect a blink from an incomplete cycle', () => {
    const session = new LivenessChallengeSession('blink');
    session.addFrame(
      { leftEyeOpenProbability: 0.9, rightEyeOpenProbability: 0.9 } as Parameters<
        typeof faceToLivenessSample
      >[0],
      0,
    );
    expect(session.getResult()).toEqual({ detected: false });
  });

  it('detects a completed head turn across recorded frames', () => {
    const session = new LivenessChallengeSession('head-turn');
    session.addFrame({ yawAngle: 0 } as Parameters<typeof faceToLivenessSample>[0], 0);
    session.addFrame({ yawAngle: 30 } as Parameters<typeof faceToLivenessSample>[0], 100);

    expect(session.getResult()).toEqual({ detected: true, direction: 'right' });
  });

  it('drops samples older than the retention window', () => {
    const session = new LivenessChallengeSession('head-turn', 1000);
    // Baseline far in the past, outside the window once later frames arrive.
    session.addFrame({ yawAngle: 0 } as Parameters<typeof faceToLivenessSample>[0], 0);
    session.addFrame({ yawAngle: 30 } as Parameters<typeof faceToLivenessSample>[0], 5000);

    // The stale baseline (t=0) was dropped, so 5000's yaw becomes the new
    // baseline on its own — no prior sample left to compare it against.
    expect(session.getResult()).toEqual({ detected: false, direction: null });
  });

  it('resets accumulated samples', () => {
    const session = new LivenessChallengeSession('blink');
    session.addFrame(
      { leftEyeOpenProbability: 0.9, rightEyeOpenProbability: 0.9 } as Parameters<
        typeof faceToLivenessSample
      >[0],
      0,
    );
    session.addFrame(
      { leftEyeOpenProbability: 0.1, rightEyeOpenProbability: 0.1 } as Parameters<
        typeof faceToLivenessSample
      >[0],
      100,
    );
    session.reset();
    session.addFrame(
      { leftEyeOpenProbability: 0.9, rightEyeOpenProbability: 0.9 } as Parameters<
        typeof faceToLivenessSample
      >[0],
      200,
    );

    // Without the reset, this would complete the blink cycle started above.
    expect(session.getResult()).toEqual({ detected: false });
  });

  it('defaults to LIVENESS_SAMPLE_WINDOW_MS when no window is given', () => {
    const session = new LivenessChallengeSession('head-turn');
    session.addFrame({ yawAngle: 0 } as Parameters<typeof faceToLivenessSample>[0], 0);
    session.addFrame(
      { yawAngle: 30 } as Parameters<typeof faceToLivenessSample>[0],
      LIVENESS_SAMPLE_WINDOW_MS - 1,
    );
    expect(session.getResult()).toEqual({ detected: true, direction: 'right' });
  });
});
