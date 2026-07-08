/**
 * Unit tests for the duplicate-punch guard's pure decision logic
 * (ADR-016) — no database involved, since `inferNextPunchType` is
 * deliberately factored out to be testable in isolation.
 */
import { describe, expect, it } from 'vitest';
import { inferNextPunchType, PUNCH_TYPE } from './attendanceService';

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
