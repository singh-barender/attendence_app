/**
 * Unit tests for the day-summary status/hours derivation logic
 * (requirements.md's "Attendance status & work hours") — no database
 * involved.
 */
import { describe, expect, it } from 'vitest';
import type { AttendanceRecord } from '../generated/prisma/client';
import { ATTENDANCE_STATUS, deriveDaySummary } from './attendanceReportingService';

const SHIFT_START_HOUR = 9;

function fixtureRecord(timestamp: Date, type: 'CHECK_IN' | 'CHECK_OUT'): AttendanceRecord {
  return {
    id: `fixture-${type}`,
    userId: 'fixture-user',
    date: '2026-07-08',
    type,
    timestamp,
    method: 'FINGERPRINT',
    matchScore: null,
    latitude: null,
    longitude: null,
  } as AttendanceRecord;
}

describe('deriveDaySummary', () => {
  it('is INCOMPLETE when there is no check-out yet', () => {
    const checkIn = fixtureRecord(new Date('2026-07-08T08:00:00Z'), 'CHECK_IN');
    const summary = deriveDaySummary('2026-07-08', checkIn, null, SHIFT_START_HOUR);
    expect(summary.status).toBe(ATTENDANCE_STATUS.INCOMPLETE);
    expect(summary.hoursWorked).toBeNull();
  });

  it('is PRESENT when checked in on or before the shift start hour', () => {
    const checkIn = fixtureRecord(new Date('2026-07-08T09:00:00'), 'CHECK_IN');
    const checkOut = fixtureRecord(new Date('2026-07-08T17:00:00'), 'CHECK_OUT');
    const summary = deriveDaySummary('2026-07-08', checkIn, checkOut, SHIFT_START_HOUR);
    expect(summary.status).toBe(ATTENDANCE_STATUS.PRESENT);
    expect(summary.hoursWorked).toBeCloseTo(8);
  });

  it('is LATE when checked in after the shift start hour', () => {
    const checkIn = fixtureRecord(new Date('2026-07-08T09:30:00'), 'CHECK_IN');
    const checkOut = fixtureRecord(new Date('2026-07-08T17:30:00'), 'CHECK_OUT');
    const summary = deriveDaySummary('2026-07-08', checkIn, checkOut, SHIFT_START_HOUR);
    expect(summary.status).toBe(ATTENDANCE_STATUS.LATE);
    expect(summary.hoursWorked).toBeCloseTo(8);
  });
});
