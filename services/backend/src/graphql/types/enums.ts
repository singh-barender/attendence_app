/**
 * GraphQL enums mirroring the string-literal constants in the attendance
 * services — the schema is the API-surface source of truth for these values
 * (ADR-012), while the services' own constants remain the source of truth
 * for the backend's internal logic. Both must stay in sync; there are only a
 * few of these, reviewed together here rather than duplicated per file.
 */

import { ATTENDANCE_STATUS } from '../../services/attendanceReportingService';
import { PUNCH_TYPE, VERIFICATION_METHOD } from '../../services/attendanceService';
import { builder } from '../builder';

export const PunchTypeEnum = builder.enumType('PunchType', {
  values: Object.values(PUNCH_TYPE),
});

export const VerificationMethodEnum = builder.enumType('VerificationMethod', {
  values: Object.values(VERIFICATION_METHOD),
});

export const AttendanceStatusEnum = builder.enumType('AttendanceStatus', {
  values: Object.values(ATTENDANCE_STATUS),
});
