/**
 * GraphQL enums mirroring the string-literal constants in the attendance
 * services — the schema is the API-surface source of truth for these values
 * (ADR-012), while the services' own constants remain the source of truth
 * for the backend's internal logic. Both must stay in sync; there are only a
 * few of these, reviewed together here rather than duplicated per file.
 */

import { EMBEDDING_MODEL } from '@attendance-app/face-matching';
import { ATTENDANCE_STATUS } from '../../services/attendanceReportingService';
import {
  PUNCH_TYPE,
  VERIFICATION_METHOD,
  VERIFICATION_OUTCOME,
} from '../../services/attendanceService';
import { builder } from '../builder';

export const PunchTypeEnum = builder.enumType('PunchType', {
  values: Object.values(PUNCH_TYPE),
});

export const VerificationMethodEnum = builder.enumType('VerificationMethod', {
  values: Object.values(VERIFICATION_METHOD),
});

export const VerificationOutcomeEnum = builder.enumType('VerificationOutcome', {
  values: Object.values(VERIFICATION_OUTCOME),
});

export const AttendanceStatusEnum = builder.enumType('AttendanceStatus', {
  values: Object.values(ATTENDANCE_STATUS),
});

/** Which model produced a face embedding (architecture-review-2026-07-16
 * .md's F3) — Android (MOBILEFACENET_128) vs. web (HUMAN_FACERES). */
export const EmbeddingModelEnum = builder.enumType('EmbeddingModel', {
  values: Object.values(EMBEDDING_MODEL),
});
