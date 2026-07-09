/** Public entry point for @attendance-app/liveness — see ADR-018. */

export { detectBlink, EYE_CLOSED_PROBABILITY, EYE_OPEN_PROBABILITY } from './detectBlink.js';
export { detectHeadTurn, HEAD_TURN_MIN_DEGREES } from './detectHeadTurn.js';
export type {
  BlinkDetectionResult,
  HeadTurnDetectionResult,
  HeadTurnDirection,
  LivenessChallengeResult,
  LivenessChallengeType,
  LivenessSample,
} from './types.js';
