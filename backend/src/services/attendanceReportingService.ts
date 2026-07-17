/**
 * The read path for attendance: derived day-summary status/hours
 * (requirements.md's "Attendance status & work hours") and the raw
 * per-punch record list for CSV export (ADR-014). Split from
 * attendanceService.ts (the write path — punch recording, the duplicate-
 * punch guard, verification logging) since these are a distinct concern.
 */
import { config } from '../config';
import { prisma } from '../db/client';
import type { AttendanceRecord } from '../generated/prisma/client';
import { PUNCH_TYPE, todayDateString } from './attendanceService';

/**
 * FULL_DAY/PARTIAL_DAY replace the old on-time-only PRESENT status with an
 * hours-worked-based one (user-requested); OPEN and MISSED replace the old
 * single INCOMPLETE value, which conflated "still checked in today" (an
 * ongoing session, expected to still resolve) with "a past day that never
 * got a checkout" (a genuinely missed punch) — these need visibly different
 * treatment (task 4.13 follow-up). `isLate` (below) is deliberately its own
 * field, not folded into `status`, so arrival-time lateness keeps being
 * tracked independently of whether the day was a full 8 hours.
 */
export const ATTENDANCE_STATUS = {
  FULL_DAY: 'FULL_DAY',
  PARTIAL_DAY: 'PARTIAL_DAY',
  OPEN: 'OPEN',
  MISSED: 'MISSED',
} as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS];

export interface AttendanceDaySummary {
  date: string;
  checkIn: AttendanceRecord | null;
  checkOut: AttendanceRecord | null;
  status: AttendanceStatus;
  isLate: boolean;
  hoursWorked: number | null;
}

function isLateCheckIn(checkInTimestamp: Date, shiftStartHour: number): boolean {
  const shiftStart = new Date(checkInTimestamp);
  shiftStart.setHours(shiftStartHour, 0, 0, 0);
  return checkInTimestamp.getTime() > shiftStart.getTime();
}

/**
 * Pure decision logic (requirements.md's "Attendance status & work hours"):
 * derives a day's status and hours-worked from its check-in/check-out pair.
 * `todayDate` must come from the same `todayDateString()` the write path
 * (`attendanceService.ts`) uses to stamp new records — reusing that one
 * function (rather than a second date computation here) is what guarantees
 * the write path and this read-path "is this today" check can never drift
 * out of sync with each other. Kept separate from the Prisma grouping query
 * below so it's unit-testable without a database.
 */
export function deriveDaySummary(
  date: string,
  checkIn: AttendanceRecord | null,
  checkOut: AttendanceRecord | null,
  shiftStartHour: number,
  fullDayHours: number,
  todayDate: string,
): AttendanceDaySummary {
  const isLate = checkIn ? isLateCheckIn(checkIn.timestamp, shiftStartHour) : false;

  if (!checkIn || !checkOut) {
    const isOpenToday = Boolean(checkIn) && !checkOut && date === todayDate;
    return {
      date,
      checkIn,
      checkOut: checkOut ?? null,
      status: isOpenToday ? ATTENDANCE_STATUS.OPEN : ATTENDANCE_STATUS.MISSED,
      isLate,
      hoursWorked: null,
    };
  }

  const hoursWorked =
    (checkOut.timestamp.getTime() - checkIn.timestamp.getTime()) / (1000 * 60 * 60);
  const status =
    hoursWorked >= fullDayHours ? ATTENDANCE_STATUS.FULL_DAY : ATTENDANCE_STATUS.PARTIAL_DAY;

  return { date, checkIn, checkOut, status, isLate, hoursWorked };
}

/** Inclusive YYYY-MM-DD date-range filter for the CSV export's presets
 * (Today / This Week / This Month / All). Because `date` is stored as a
 * zero-padded YYYY-MM-DD string, a lexicographic `gte`/`lte` is also a
 * chronological one, so no date parsing is needed here. */
export interface DateRange {
  from?: string | undefined;
  to?: string | undefined;
}

/**
 * Groups a user's attendance records by date and derives each day's summary
 * (ADR-016), most recent day first. An optional `range` narrows the records
 * to an inclusive [from, to] window (used by the CSV export's date presets);
 * omitting it returns the full history, as the GraphQL `attendanceHistory`
 * query does.
 */
export async function getAttendanceHistory(
  userId: string,
  range?: DateRange,
): Promise<AttendanceDaySummary[]> {
  const dateBounds = {
    ...(range?.from ? { gte: range.from } : {}),
    ...(range?.to ? { lte: range.to } : {}),
  };
  const records = await prisma.attendanceRecord.findMany({
    where: {
      userId,
      ...(range?.from || range?.to ? { date: dateBounds } : {}),
    },
    orderBy: { timestamp: 'asc' },
  });

  const byDate = new Map<
    string,
    { checkIn: AttendanceRecord | null; checkOut: AttendanceRecord | null }
  >();
  for (const record of records) {
    const entry = byDate.get(record.date) ?? { checkIn: null, checkOut: null };
    if (record.type === PUNCH_TYPE.CHECK_IN) {
      entry.checkIn = record;
    } else {
      entry.checkOut = record;
    }
    byDate.set(record.date, entry);
  }

  const today = todayDateString();
  return Array.from(byDate.entries())
    .map(([date, { checkIn, checkOut }]) =>
      deriveDaySummary(date, checkIn, checkOut, config.shiftStartHour, config.fullDayHours, today),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Raw per-punch records for the CSV export (ADR-014) — one row per punch,
 * not grouped into day summaries, since a spreadsheet export is more useful
 * as a flat event log (requirements.md's Reporting section lists this as
 * distinct from the grouped `attendanceHistory` view).
 */
export async function getAllAttendanceRecords(userId: string): Promise<AttendanceRecord[]> {
  return prisma.attendanceRecord.findMany({
    where: { userId },
    orderBy: { timestamp: 'desc' },
  });
}
