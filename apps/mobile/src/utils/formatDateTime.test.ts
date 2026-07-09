import { formatHoursWorked, formatMemberSince } from './formatDateTime';

describe('formatHoursWorked', () => {
  it('formats a whole number of hours with no minutes', () => {
    expect(formatHoursWorked(3)).toBe('3h 0m');
  });

  it('formats a partial hour', () => {
    expect(formatHoursWorked(2.5)).toBe('2h 30m');
  });

  it('rounds the whole-hour boundary instead of overflowing minutes to 60', () => {
    // Regression test (audit checkpoint 1.C2): flooring hours then rounding
    // the remainder independently used to produce "2h 60m" here.
    expect(formatHoursWorked(2.9999999)).toBe('3h 0m');
  });

  it('handles zero hours worked', () => {
    expect(formatHoursWorked(0)).toBe('0h 0m');
  });
});

describe('formatMemberSince', () => {
  it('formats an ISO timestamp as a long date', () => {
    expect(formatMemberSince('2026-01-05T12:00:00.000Z')).toBe('January 5, 2026');
  });
});
