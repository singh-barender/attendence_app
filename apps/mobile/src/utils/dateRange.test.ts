import { getDateRange } from './dateRange';

// A fixed reference point: Friday 2026-07-10 (that week's Monday is 2026-07-06).
const FRIDAY = new Date(2026, 6, 10, 12, 0, 0);

describe('getDateRange', () => {
  it('bounds "today" to the single current date', () => {
    expect(getDateRange('today', FRIDAY)).toEqual({ from: '2026-07-10', to: '2026-07-10' });
  });

  it('bounds "week" from Monday of the current week through today', () => {
    expect(getDateRange('week', FRIDAY)).toEqual({ from: '2026-07-06', to: '2026-07-10' });
  });

  it('bounds "month" from the 1st through today', () => {
    expect(getDateRange('month', FRIDAY)).toEqual({ from: '2026-07-01', to: '2026-07-10' });
  });

  it('returns no bounds for "all"', () => {
    expect(getDateRange('all', FRIDAY)).toEqual({});
  });

  it('handles a Monday (week start is the same day)', () => {
    const monday = new Date(2026, 6, 6, 9, 0, 0);
    expect(getDateRange('week', monday)).toEqual({ from: '2026-07-06', to: '2026-07-06' });
  });

  it('handles a Sunday (still belongs to the week that began Monday)', () => {
    const sunday = new Date(2026, 6, 12, 9, 0, 0);
    expect(getDateRange('week', sunday)).toEqual({ from: '2026-07-06', to: '2026-07-12' });
  });
});
