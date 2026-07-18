import type { LivenessSample, NodDetectionResult } from './types.js';

export const NOD_PITCH_DEGREES = 10;

export function detectNod(samples: readonly LivenessSample[]): NodDetectionResult {
  let baselinePitch: number | null = null;
  let maxDeviation = 0;

  for (const sample of samples) {
    if (sample.pitchAngleDegrees === null) {
      continue;
    }
    if (baselinePitch === null) {
      baselinePitch = sample.pitchAngleDegrees;
      continue;
    }

    const delta = sample.pitchAngleDegrees - baselinePitch;
    if (Math.abs(delta) > Math.abs(maxDeviation)) {
      maxDeviation = delta;
    }
  }

  return { detected: Math.abs(maxDeviation) >= NOD_PITCH_DEGREES };
}
