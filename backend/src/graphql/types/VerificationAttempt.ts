/**
 * Pothos object type for VerificationAttempt (task 4.4, ADR-019) — exposes
 * `method`/`outcome` as real GraphQL enums (not raw strings), matching
 * AttendanceRecord's own convention. `userId` is deliberately not exposed:
 * a client only ever reads its own attempts via `myVerificationAttempts`,
 * so which account they belong to is already implied.
 */
import type { VerificationMethod, VerificationOutcome } from '../../services/attendanceService';
import { builder } from '../builder';
import { VerificationMethodEnum, VerificationOutcomeEnum } from './enums';
import { DateTimeScalar } from './scalars';

export const VerificationAttemptRef = builder.prismaObject('VerificationAttempt', {
  fields: (t) => ({
    id: t.exposeID('id'),
    method: t.field({
      type: VerificationMethodEnum,
      resolve: (attempt) => attempt.method as VerificationMethod,
    }),
    outcome: t.field({
      type: VerificationOutcomeEnum,
      resolve: (attempt) => attempt.outcome as VerificationOutcome,
    }),
    matchScore: t.exposeFloat('matchScore', { nullable: true }),
    timestamp: t.field({
      type: DateTimeScalar,
      resolve: (attempt) => attempt.timestamp,
    }),
  }),
});
