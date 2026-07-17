/**
 * GraphQL contract for server-side liveness re-verification
 * (architecture-review-2026-07-16.md's F1) — `punchInFace` now receives the
 * same per-frame sample window the client collected for its liveness
 * challenge, and the resolver re-runs `@attendance-app/liveness`'s pure
 * decision functions against it, exactly mirroring how ADR-007 already
 * treats face-match: the client's own judgment is optimistic UI only, the
 * server's independent re-check is what actually decides.
 *
 * `LivenessChallengeTypeEnum`'s GraphQL value names (BLINK_TWICE, HEAD_TURN)
 * differ from `@attendance-app/liveness`'s internal string literals
 * ('blink-twice', 'head-turn') only because GraphQL enum value names can't
 * contain hyphens — Pothos's `value:` mapping keeps the internal string the
 * single source of truth `judgeLiveness` (punchIn.ts) actually switches on.
 */
import type { LivenessChallengeType, LivenessSample } from '@attendance-app/liveness';
import { builder } from '../builder';

export const LivenessChallengeTypeEnum = builder.enumType('LivenessChallengeType', {
  values: {
    BLINK: { value: 'blink' satisfies LivenessChallengeType },
    BLINK_TWICE: { value: 'blink-twice' satisfies LivenessChallengeType },
    HEAD_TURN: { value: 'head-turn' satisfies LivenessChallengeType },
    SMILE: { value: 'smile' satisfies LivenessChallengeType },
    NOD: { value: 'nod' satisfies LivenessChallengeType },
  },
});

export const LivenessSampleInput = builder.inputType('LivenessSampleInput', {
  fields: (t) => ({
    timestampMs: t.int({ required: true }),
    leftEyeOpenProbability: t.float(),
    rightEyeOpenProbability: t.float(),
    yawAngleDegrees: t.float(),
    smileProbability: t.float(),
    pitchAngleDegrees: t.float(),
  }),
});

/** Pothos input-arg shape for a `LivenessSampleInput` list item — matches
 * `LivenessSample` field-for-field except every field arrives as
 * `| null | undefined` (GraphQL's optional-arg convention), which
 * `toLivenessSample` below normalizes to `LivenessSample`'s `| null` only. */
export interface LivenessSampleArg {
  timestampMs: number;
  leftEyeOpenProbability?: number | null | undefined;
  rightEyeOpenProbability?: number | null | undefined;
  yawAngleDegrees?: number | null | undefined;
  smileProbability?: number | null | undefined;
  pitchAngleDegrees?: number | null | undefined;
}

export function toLivenessSample(sample: LivenessSampleArg): LivenessSample {
  return {
    timestampMs: sample.timestampMs,
    leftEyeOpenProbability: sample.leftEyeOpenProbability ?? null,
    rightEyeOpenProbability: sample.rightEyeOpenProbability ?? null,
    yawAngleDegrees: sample.yawAngleDegrees ?? null,
    smileProbability: sample.smileProbability ?? null,
    pitchAngleDegrees: sample.pitchAngleDegrees ?? null,
  };
}
