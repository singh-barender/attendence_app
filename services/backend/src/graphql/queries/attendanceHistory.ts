/**
 * attendanceHistory — requires auth (ADR-004); returns the derived
 * per-day summaries (ADR-016), most recent first.
 */
import { getAttendanceHistory } from '../../services/attendanceReportingService';
import { builder } from '../builder';
import { requireUserId } from '../context';
import { AttendanceDaySummaryRef } from '../types/AttendanceDaySummary';

builder.queryField('attendanceHistory', (t) =>
  t.field({
    type: [AttendanceDaySummaryRef],
    resolve: async (_root, _args, ctx) => {
      const userId = requireUserId(ctx);
      return getAttendanceHistory(userId);
    },
  }),
);
