/**
 * Unit tests for the day-summary status/hours derivation logic
 * (requirements.md's "Attendance status & work hours") — no database
 * involved.
 */
import { describe, expect, it } from 'vitest';
import type { AttendanceRecord } from '../generated/prisma/client';
import { ATTENDANCE_STATUS, deriveDaySummary } from './attendanceReportingService';

const SHIFT_START_HOUR = 9;
const FULL_DAY_HOURS = 8;
const TODAY = '2026-07-08';
const YESTERDAY = '2026-07-07';

function fixtureRecord(
  timestamp: Date,
  type: 'CHECK_IN' | 'CHECK_OUT',
  date = TODAY,
): AttendanceRecord {
  return {
    id: `fixture-${type}`,
    userId: 'fixture-user',
    date,
    type,
    timestamp,
    method: 'FINGERPRINT',
    matchScore: null,
    latitude: null,
    longitude: null,
  } as AttendanceRecord;
}

describe('deriveDaySummary', () => {
  it('is OPEN when checked in today with no check-out yet', () => {
    const checkIn = fixtureRecord(new Date('2026-07-08T08:00:00Z'), 'CHECK_IN');
    const summary = deriveDaySummary(TODAY, checkIn, null, SHIFT_START_HOUR, FULL_DAY_HOURS, TODAY);
    expect(summary.status).toBe(ATTENDANCE_STATUS.OPEN);
    expect(summary.hoursWorked).toBeNull();
  });

  it('is MISSED when a past day was checked in but never checked out', () => {
    const checkIn = fixtureRecord(new Date('2026-07-07T08:00:00Z'), 'CHECK_IN', YESTERDAY);
    const summary = deriveDaySummary(
      YESTERDAY,
      checkIn,
      null,
      SHIFT_START_HOUR,
      FULL_DAY_HOURS,
      TODAY,
    );
    expect(summary.status).toBe(ATTENDANCE_STATUS.MISSED);
    expect(summary.hoursWorked).toBeNull();
  });

  it('is FULL_DAY when hours worked meets the full-day threshold', () => {
    const checkIn = fixtureRecord(new Date('2026-07-08T09:00:00'), 'CHECK_IN');
    const checkOut = fixtureRecord(new Date('2026-07-08T17:00:00'), 'CHECK_OUT');
    const summary = deriveDaySummary(
      TODAY,
      checkIn,
      checkOut,
      SHIFT_START_HOUR,
      FULL_DAY_HOURS,
      TODAY,
    );
    expect(summary.status).toBe(ATTENDANCE_STATUS.FULL_DAY);
    expect(summary.isLate).toBe(false);
    expect(summary.hoursWorked).toBeCloseTo(8);
  });

  it('is PARTIAL_DAY when checked out before the full-day threshold', () => {
    const checkIn = fixtureRecord(new Date('2026-07-08T09:00:00'), 'CHECK_IN');
    const checkOut = fixtureRecord(new Date('2026-07-08T13:00:00'), 'CHECK_OUT');
    const summary = deriveDaySummary(
      TODAY,
      checkIn,
      checkOut,
      SHIFT_START_HOUR,
      FULL_DAY_HOURS,
      TODAY,
    );
    expect(summary.status).toBe(ATTENDANCE_STATUS.PARTIAL_DAY);
    expect(summary.hoursWorked).toBeCloseTo(4);
  });

  it('sets isLate independently of the hours-based status when checked in after shift start', () => {
    const checkIn = fixtureRecord(new Date('2026-07-08T09:30:00'), 'CHECK_IN');
    const checkOut = fixtureRecord(new Date('2026-07-08T17:30:00'), 'CHECK_OUT');
    const summary = deriveDaySummary(
      TODAY,
      checkIn,
      checkOut,
      SHIFT_START_HOUR,
      FULL_DAY_HOURS,
      TODAY,
    );
    expect(summary.status).toBe(ATTENDANCE_STATUS.FULL_DAY);
    expect(summary.isLate).toBe(true);
    expect(summary.hoursWorked).toBeCloseTo(8);
  });
});
