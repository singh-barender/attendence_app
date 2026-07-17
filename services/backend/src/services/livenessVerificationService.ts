/**
 * Server-side liveness re-verification (architecture-review-2026-07-16.md's
 * F1) — re-runs `@attendance-app/liveness`'s pure decision functions against
 * the same sample window the client used to judge its own challenge, rather
 * than trusting the client's `detected` boolean. This is the one place a
 * `punchInFace` call is refused for failing liveness, before the face-match
 * re-verification (`packages/face-matching`) even runs — a static photo (or
 * a replayed embedding submitted directly against the API, bypassing the
 * app entirely) can't produce a genuine open→closed→open eye transition (or
 * the other challenge types' equivalents) across real, temporally-ordered
 * samples.
 */
import {
  detectBlink,
  detectHeadTurn,
  detectNod,
  detectSmile,
  type LivenessChallengeType,
  type LivenessSample,
} from '@attendance-app/liveness';

export function judgeLiveness(
  type: LivenessChallengeType,
  samples: readonly LivenessSample[],
): boolean {
  switch (type) {
    case 'blink':
      return detectBlink(samples, 1).detected;
    case 'blink-twice':
      return detectBlink(samples, 2).detected;
    case 'smile':
      return detectSmile(samples).detected;
    case 'nod':
      return detectNod(samples).detected;
    case 'head-turn':
      return detectHeadTurn(samples).detected;
  }
}
