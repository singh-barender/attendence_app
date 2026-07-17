import { computeMonthlyStats } from './attendanceStats';

// Friday 2026-07-10; weekdays elapsed in July 1–10 = 8 (excludes Sat 4th, Sun 5th).
const NOW = new Date(2026, 6, 10, 12, 0, 0);

const DAYS = [
  { date: '2026-07-01', status: 'FULL_DAY', isLate: false },
  { date: '2026-07-02', status: 'PARTIAL_DAY', isLate: true },
  { date: '2026-07-03', status: 'MISSED', isLate: false },
  { date: '2026-07-10', status: 'OPEN', isLate: true },
  // Prior month — must be excluded from "this month" figures.
  { date: '2026-06-30', status: 'FULL_DAY', isLate: false },
];

describe('computeMonthlyStats', () => {
  it('counts only the current month and classifies each status', () => {
    const stats = computeMonthlyStats(DAYS, NOW);
    expect(stats.present).toBe(3); // FULL_DAY + PARTIAL_DAY + OPEN
    expect(stats.fullDays).toBe(1);
    expect(stats.partialDays).toBe(1);
    expect(stats.missed).toBe(1);
    expect(stats.late).toBe(2);
    expect(stats.weekdaysElapsed).toBe(8);
    expect(stats.attendancePercent).toBe(38); // round(3 / 8 * 100)
  });

  it('is all-zero with no attendance and never divides by zero', () => {
    const stats = computeMonthlyStats([], NOW);
    expect(stats).toMatchObject({ present: 0, fullDays: 0, missed: 0, late: 0 });
    expect(stats.attendancePercent).toBe(0);
  });

  it('caps the percentage at 100 when present exceeds weekdays', () => {
    const everyDay = Array.from({ length: 10 }, (_, index) => ({
      date: `2026-07-${String(index + 1).padStart(2, '0')}`,
      status: 'FULL_DAY',
      isLate: false,
    }));
    expect(computeMonthlyStats(everyDay, NOW).attendancePercent).toBe(100);
  });
});
