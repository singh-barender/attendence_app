/**
 * Unit tests for the duplicate-punch guard's pure decision logic
 * (ADR-016) — no database involved, since `inferNextPunchType` is
 * deliberately factored out to be testable in isolation. Also covers
 * `resolvePunchTimestamp`/`todayDateString` — the offline sync effective-
 * timestamp resolution (two rounds of follow-up review findings) — for the
 * same reason.
 */
import { describe, expect, it } from 'vitest';
import {
  inferNextPunchType,
  PUNCH_TYPE,
  resolvePunchTimestamp,
  todayDateString,
} from './attendanceService';

describe('inferNextPunchType', () => {
  it('returns CHECK_IN when there are no punches yet today', () => {
    expect(inferNextPunchType([])).toBe(PUNCH_TYPE.CHECK_IN);
  });

  it('returns CHECK_OUT after a CHECK_IN', () => {
    expect(inferNextPunchType([PUNCH_TYPE.CHECK_IN])).toBe(PUNCH_TYPE.CHECK_OUT);
  });

  it('throws once both CHECK_IN and CHECK_OUT are recorded', () => {
    expect(() => inferNextPunchType([PUNCH_TYPE.CHECK_IN, PUNCH_TYPE.CHECK_OUT])).toThrow(
      /already checked out/i,
    );
  });

  it('is order-independent (CHECK_OUT recorded before CHECK_IN in the array)', () => {
    expect(() => inferNextPunchType([PUNCH_TYPE.CHECK_OUT, PUNCH_TYPE.CHECK_IN])).toThrow(
      /already checked out/i,
    );
  });
});

describe('resolvePunchTimestamp', () => {
  it('falls back to server-received time when no client timestamp is supplied', () => {
    const serverNow = new Date('2026-07-16T23:00:00');
    expect(resolvePunchTimestamp(null, serverNow)).toBe(serverNow);
  });

  it("uses the client's timestamp when it's plausible (the offline-sync midnight-rollover fix)", () => {
    // Punched at 5pm, but the mutation only actually reached the server
    // after local midnight — the punch must still bucket against the day
    // the user experienced it on, not the day the server received it.
    const punchedAt = new Date('2026-07-16T17:00:00');
    const serverReceivedAt = new Date('2026-07-17T00:05:00');
    expect(resolvePunchTimestamp(punchedAt, serverReceivedAt)).toBe(punchedAt);
  });

  it('ignores a client timestamp wildly divergent from server time (a badly wrong device clock)', () => {
    const serverNow = new Date('2026-07-16T12:00:00');
    const wildlyWrong = new Date('2027-01-01T00:00:00');
    expect(resolvePunchTimestamp(wildlyWrong, serverNow)).toBe(serverNow);
  });
});

describe('todayDateString', () => {
  it('formats an arbitrary reference date as YYYY-MM-DD', () => {
    expect(todayDateString(new Date('2026-01-05T08:30:00'))).toBe('2026-01-05');
  });

  it('pads single-digit months and days', () => {
    expect(todayDateString(new Date('2026-03-07T00:00:00'))).toBe('2026-03-07');
  });
});
