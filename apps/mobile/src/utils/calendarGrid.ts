/**
 * Pure month-grid layout math for `AttendanceCalendar`, split out
 * (coding-standards.md's "small, modular, single-responsibility files") so
 * it's unit-testable without rendering anything.
 */
import type { AttendanceHistoryQuery } from '../generated/graphql';
import { toDateOnlyString } from './formatDateTime';

export type AttendanceDay = NonNullable<AttendanceHistoryQuery['attendanceHistory']>[number];

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const WEEK_LENGTH = 7;

export interface GridCell {
  dateOnly: string;
  dayNumber: number;
}

export function buildMonthGrid(year: number, monthIndex: number): (GridCell | null)[] {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingBlanks = new Date(year, monthIndex, 1).getDay();

  const cells: (GridCell | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const dayNumber = index + 1;
      return { dateOnly: toDateOnlyString(year, monthIndex, dayNumber), dayNumber };
    }),
  ];
  while (cells.length % WEEK_LENGTH !== 0) {
    cells.push(null);
  }
  return cells;
}

export function chunkIntoWeeks(grid: (GridCell | null)[]): (GridCell | null)[][] {
  const result: (GridCell | null)[][] = [];
  for (let start = 0; start < grid.length; start += WEEK_LENGTH) {
    result.push(grid.slice(start, start + WEEK_LENGTH));
  }
  return result;
}
