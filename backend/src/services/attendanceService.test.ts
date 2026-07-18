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
  it('returns CHECK_IN when there is no prior punch at all', () => {
    expect(inferNextPunchType(null, null)).toBe(PUNCH_TYPE.CHECK_IN);
  });

  it('returns CHECK_OUT when the most recent punch was a CHECK_IN less than 16 hours ago', () => {
    expect(inferNextPunchType(PUNCH_TYPE.CHECK_IN, 5)).toBe(PUNCH_TYPE.CHECK_OUT);
  });

  it('returns CHECK_IN when the most recent punch was a CHECK_IN more than 16 hours ago (abandoned shift)', () => {
    expect(inferNextPunchType(PUNCH_TYPE.CHECK_IN, 17)).toBe(PUNCH_TYPE.CHECK_IN);
  });

  // Round 7 review finding: this used to group "today's" punches by
  // calendar date instead of looking at the single most recent one — a
  // shift crossing midnight (9pm check-in, 5am check-out) fell on two
  // different dates, so the 5am departure was misread as a fresh CHECK_IN
  // for an "empty" new day rather than the CHECK_OUT it actually was. This
  // function no longer takes a date at all, so there's no longer a calendar
  // boundary to get that wrong at — the fix is structural, not a special
  // case bolted onto the old signature (the integration test in app.test.ts
  // exercises the actual midnight-crossing scenario end-to-end).
  it('returns CHECK_IN when the most recent punch was a CHECK_OUT (starting a new shift)', () => {
    expect(inferNextPunchType(PUNCH_TYPE.CHECK_OUT, 12)).toBe(PUNCH_TYPE.CHECK_IN);
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
