import type { LivenessSample, NodDetectionResult } from './types.js';

export const NOD_PITCH_DEGREES = 10;

export function detectNod(samples: readonly LivenessSample[]): NodDetectionResult {
  if (samples.length === 0) {
    return { detected: false };
  }

  const baselineSample = samples[0];
  if (!baselineSample) {
    return { detected: false };
  }

  const baselinePitch = baselineSample.pitchAngleDegrees;
  if (baselinePitch === null) {
    return { detected: false };
  }

  for (const sample of samples) {
    if (sample.pitchAngleDegrees === null) {
      continue;
    }
    const delta = sample.pitchAngleDegrees - baselinePitch;
    // A nod is typically pitching down, which is a positive or negative pitch depending on convention.
    // Let's just check absolute magnitude for simplicity, like head turn.
    if (Math.abs(delta) >= NOD_PITCH_DEGREES) {
      return { detected: true };
    }
  }
  return { detected: false };
}
