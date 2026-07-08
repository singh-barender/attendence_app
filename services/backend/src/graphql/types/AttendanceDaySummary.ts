/**
 * Pothos object type for the derived per-day attendance summary
 * (requirements.md's "Attendance status & work hours") — not a Prisma
 * model, since status/hoursWorked are computed, not stored (ADR-016).
 */
import type { AttendanceDaySummary } from '../../services/attendanceReportingService';
import { builder } from '../builder';
import { AttendanceRecordRef } from './AttendanceRecord';
import { AttendanceStatusEnum } from './enums';

export const AttendanceDaySummaryRef = builder
  .objectRef<AttendanceDaySummary>('AttendanceDaySummary')
  .implement({
    fields: (t) => ({
      date: t.exposeString('date'),
      checkIn: t.field({
        type: AttendanceRecordRef,
        nullable: true,
        resolve: (summary) => summary.checkIn,
      }),
      checkOut: t.field({
        type: AttendanceRecordRef,
        nullable: true,
        resolve: (summary) => summary.checkOut,
      }),
      status: t.field({ type: AttendanceStatusEnum, resolve: (summary) => summary.status }),
      hoursWorked: t.exposeFloat('hoursWorked', { nullable: true }),
    }),
  });
