/** Public entry point for @attendance-app/liveness — see ADR-018. */

export { detectBlink, EYE_CLOSED_PROBABILITY, EYE_OPEN_PROBABILITY } from './detectBlink.js';
export { detectHeadTurn, HEAD_TURN_MIN_DEGREES } from './detectHeadTurn.js';
export { detectNod, NOD_PITCH_DEGREES } from './detectNod.js';
export { detectSmile, SMILE_PROBABILITY_THRESHOLD } from './detectSmile.js';
export type {
  BlinkDetectionResult,
  HeadTurnDetectionResult,
  HeadTurnDirection,
  LivenessChallengeResult,
  LivenessChallengeType,
  LivenessSample,
  NodDetectionResult,
  SmileDetectionResult,
} from './types.js';
