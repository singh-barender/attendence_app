/**
 * Pure builders for the CSV export (ADR-014) — kept database-free and
 * side-effect-free so both the per-day report layout and the download
 * filename are unit-testable without a Fastify request or Prisma.
 *
 * The export is a **per-day report** (one row per day, requirements.md's
 * "attendance history/report"), not a raw per-punch log: pairing each day's
 * check-in and check-out is what lets Work Hours and Status be real columns.
 * Times/hours are formatted in the server's local time zone, matching the
 * single-server-clock notion of "today" the rest of the app uses (ADR-016 —
 * a deliberate POC simplification, no per-user time zones).
 */

import type { AttendanceDaySummary } from './attendanceReportingService';

/** Human labels for the export — the GraphQL enum values are machine-facing;
 * a spreadsheet wants "Full day", not "FULL_DAY". */
const STATUS_LABELS: Record<string, string> = {
  FULL_DAY: 'Full day',
  PARTIAL_DAY: 'Partial day',
  OPEN: 'Open',
  MISSED: 'Missed',
};

const CSV_HEADER = [
  'Full Name',
  'Email',
  'Date',
  'Check In Time',
  'Check Out Time',
  'Work Hours',
  'Attendance Status',
  'Late',
  'Check-in Method',
  'Check-out Method',
  'GPS Latitude',
  'GPS Longitude',
  'Address',
  'Match Score (Face)',
  'Sync Status',
  'Created Timestamp',
] as const;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function toCsvRow(values: readonly (string | number | null)[]): string {
  return values.map((value) => csvEscape(value === null ? '' : String(value))).join(',');
}

/** HH:MM in server-local time; empty string for a missing punch. */
function formatClock(timestamp: Date | null | undefined): string {
  if (!timestamp) {
    return '';
  }
  const hours = String(timestamp.getHours()).padStart(2, '0');
  const minutes = String(timestamp.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/** "8h 32m" from fractional hours; empty for an open/missed day. */
function formatHoursWorked(hoursWorked: number | null): string {
  if (hoursWorked == null) {
    return '';
  }
  const totalMinutes = Math.round(hoursWorked * 60);
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

export interface ExportUser {
  fullName: string | null;
  email: string;
}

export function buildAttendanceCsv(
  user: ExportUser,
  days: readonly AttendanceDaySummary[],
): string {
  const rows = [toCsvRow(CSV_HEADER)];
  for (const day of days) {
    rows.push(
      toCsvRow([
        user.fullName ?? '',
        user.email,
        day.date,
        formatClock(day.checkIn?.timestamp),
        formatClock(day.checkOut?.timestamp),
        formatHoursWorked(day.hoursWorked),
        STATUS_LABELS[day.status] ?? day.status,
        day.isLate ? 'Yes' : 'No',
        day.checkIn?.method ?? '',
        day.checkOut?.method ?? '',
        day.checkIn?.latitude ?? '',
        day.checkIn?.longitude ?? '',
        day.checkIn?.address ?? '',
        day.checkIn?.matchScore != null ? day.checkIn.matchScore.toFixed(2) : '',
        'Synced', // Server records are implicitly synced
        day.checkIn?.timestamp ? day.checkIn.timestamp.toISOString() : '',
      ]),
    );
  }
  return rows.join('\n');
}

/** A safe, human-meaningful segment describing the exported range, used in
 * the download filename: a single day → the date, one calendar month →
 * "July_2026", an unbounded export → "All", anything else → "from_to". */
function rangeLabel(from: string | undefined, to: string | undefined): string {
  if (!from && !to) {
    return 'All';
  }
  if (from && to) {
    if (from === to) {
      return from;
    }
    const [fromYear, fromMonth] = from.split('-');
    const [toYear, toMonth] = to.split('-');
    if (fromYear === toYear && fromMonth === toMonth) {
      const monthIndex = Number(fromMonth) - 1;
      if (MONTH_NAMES[monthIndex]) {
        return `${MONTH_NAMES[monthIndex]}_${fromYear}`;
      }
    }
    return `${from}_to_${to}`;
  }
  return from ? `from_${from}` : `to_${to}`;
}

/**
 * `Jordan_Rivera_July_2026_Attendance.csv` — the user's name (sanitized to
 * filesystem-safe characters) + a range label. The server owns this so the
 * client (which just honors the Content-Disposition filename) needs no name
 * lookup of its own.
 */
export function deriveExportFilename(
  fullName: string | null,
  from: string | undefined,
  to: string | undefined,
): string {
  const safeName =
    (fullName ?? '')
      .trim()
      .replace(/[^\w]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'attendance';
  return `${safeName}_${rangeLabel(from, to)}_Attendance.csv`;
}
