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
import { PUNCH_TYPE } from './attendanceService';

export const ATTENDANCE_STATUS = {
  PRESENT: 'PRESENT',
  LATE: 'LATE',
  INCOMPLETE: 'INCOMPLETE',
} as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS];

export interface AttendanceDaySummary {
  date: string;
  checkIn: AttendanceRecord | null;
  checkOut: AttendanceRecord | null;
  status: AttendanceStatus;
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
 * Kept separate from the Prisma grouping query below so it's unit-testable
 * without a database.
 */
export function deriveDaySummary(
  date: string,
  checkIn: AttendanceRecord | null,
  checkOut: AttendanceRecord | null,
  shiftStartHour: number,
): AttendanceDaySummary {
  if (!checkIn || !checkOut) {
    return {
      date,
      checkIn,
      checkOut: checkOut ?? null,
      status: ATTENDANCE_STATUS.INCOMPLETE,
      hoursWorked: null,
    };
  }

  const status = isLateCheckIn(checkIn.timestamp, shiftStartHour)
    ? ATTENDANCE_STATUS.LATE
    : ATTENDANCE_STATUS.PRESENT;
  const hoursWorked =
    (checkOut.timestamp.getTime() - checkIn.timestamp.getTime()) / (1000 * 60 * 60);

  return { date, checkIn, checkOut, status, hoursWorked };
}

/**
 * Groups a user's attendance records by date and derives each day's summary
 * (ADR-016), most recent day first.
 */
export async function getAttendanceHistory(userId: string): Promise<AttendanceDaySummary[]> {
  const records = await prisma.attendanceRecord.findMany({
    where: { userId },
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

  return Array.from(byDate.entries())
    .map(([date, { checkIn, checkOut }]) =>
      deriveDaySummary(date, checkIn, checkOut, config.shiftStartHour),
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
