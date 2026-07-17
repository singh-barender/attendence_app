/**
 * Unit tests for the CSV export builders — the per-day report layout and the
 * download-filename derivation, both pure (no DB, no request).
 */
import { describe, expect, it } from 'vitest';
import type { AttendanceRecord } from '../generated/prisma/client';
import { buildAttendanceCsv, deriveExportFilename } from './attendanceCsv';
import { ATTENDANCE_STATUS, type AttendanceDaySummary } from './attendanceReportingService';

function record(overrides: Partial<AttendanceRecord>): AttendanceRecord {
  return {
    id: 'r1',
    userId: 'u1',
    date: '2026-07-10',
    type: 'CHECK_IN',
    timestamp: new Date('2026-07-10T08:58:00'),
    method: 'FACE',
    matchScore: null,
    latitude: null,
    longitude: null,
    address: null,
    ...overrides,
  } as AttendanceRecord;
}

const USER = { fullName: 'Jordan Rivera', email: 'jordan@example.com' };

describe('buildAttendanceCsv', () => {
  it('emits a header plus one row per day with paired check-in/out details', () => {
    const day: AttendanceDaySummary = {
      date: '2026-07-10',
      checkIn: record({
        type: 'CHECK_IN',
        timestamp: new Date('2026-07-10T08:58:00'),
        method: 'FACE',
        matchScore: 0.846,
        address: 'Hawa Mahal, Jaipur',
      }),
      checkOut: record({
        type: 'CHECK_OUT',
        timestamp: new Date('2026-07-10T17:30:00'),
        method: 'FINGERPRINT',
      }),
      status: ATTENDANCE_STATUS.FULL_DAY,
      isLate: false,
      hoursWorked: 8.533,
    };

    const csv = buildAttendanceCsv(USER, [day]);
    const [header, row] = csv.split('\n');

    expect(header).toBe(
      'Full Name,Email,Date,Check In Time,Check Out Time,Work Hours,Attendance Status,Late,Check-in Method,Check-out Method,GPS Latitude,GPS Longitude,Address,Match Score (Face),Sync Status,Created Timestamp',
    );
    // Created Timestamp is the check-in's ISO time; computed here (not hard-
    // coded) so the assertion is timezone-independent. GPS columns are blank
    // (this fixture has no coordinates); the address contains a comma, so it's
    // quoted per CSV rules.
    const created = new Date('2026-07-10T08:58:00').toISOString();
    expect(row).toBe(
      `Jordan Rivera,jordan@example.com,2026-07-10,08:58,17:30,8h 32m,Full day,No,FACE,FINGERPRINT,,,"Hawa Mahal, Jaipur",0.85,Synced,${created}`,
    );
  });

  it('leaves check-out fields blank and flags an open, late day', () => {
    const day: AttendanceDaySummary = {
      date: '2026-07-10',
      checkIn: record({
        timestamp: new Date('2026-07-10T09:30:00'),
        method: 'FACE',
        latitude: 29.5,
        longitude: 74.3,
      }),
      checkOut: null,
      status: ATTENDANCE_STATUS.OPEN,
      isLate: true,
      hoursWorked: null,
    };

    const row = buildAttendanceCsv(USER, [day]).split('\n')[1];
    // Open day: no check-out time/method, no hours, no match score; late = Yes;
    // raw GPS columns populated, address blank (none was resolved).
    const created = new Date('2026-07-10T09:30:00').toISOString();
    expect(row).toBe(
      `Jordan Rivera,jordan@example.com,2026-07-10,09:30,,,Open,Yes,FACE,,29.5,74.3,,,Synced,${created}`,
    );
  });
});

describe('deriveExportFilename', () => {
  it('labels a single calendar month as MonthName_Year', () => {
    expect(deriveExportFilename('Jordan Rivera', '2026-07-01', '2026-07-31')).toBe(
      'Jordan_Rivera_July_2026_Attendance.csv',
    );
  });

  it('labels a single day as the date', () => {
    expect(deriveExportFilename('Jordan Rivera', '2026-07-10', '2026-07-10')).toBe(
      'Jordan_Rivera_2026-07-10_Attendance.csv',
    );
  });

  it('labels an unbounded export as All', () => {
    expect(deriveExportFilename('Jordan Rivera', undefined, undefined)).toBe(
      'Jordan_Rivera_All_Attendance.csv',
    );
  });

  it('sanitizes an empty/odd name to a safe default', () => {
    expect(deriveExportFilename(null, undefined, undefined)).toBe('attendance_All_Attendance.csv');
  });
});
