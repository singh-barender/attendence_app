/**
 * Derives this-month dashboard figures from the `attendanceHistory` the
 * Attendance screen already fetches — no extra query, no backend change.
 * Pure and unit-testable (takes "now" as an argument).
 *
 * `attendanceHistory` only contains days that have at least one punch, so a
 * day with no attendance at all is simply absent (there is no weekend /
 * holiday / expected-days model in this POC). The attendance percentage is
 * therefore a transparent proxy — days present ÷ weekdays elapsed so far
 * this month, capped at 100 — and is labelled as such in the UI, rather than
 * pretending to a precision the data doesn't support.
 */

/** The subset of an attendance day this needs — matches the codegen'd
 * `AttendanceHistory` row shape (status is a nullable enum string). */
export interface AttendanceStatSource {
  date?: string | null;
  status?: string | null;
  isLate?: boolean | null;
}

export interface MonthlyStats {
  /** Days attended (checked in) this month — full, partial, or still open. */
  present: number;
  fullDays: number;
  /** Partial days = checked out under the full-day threshold ("half days"). */
  partialDays: number;
  /** Past days this month with a check-in but no check-out. */
  missed: number;
  /** Days flagged late this month (independent of status). */
  late: number;
  /** Mon–Fri elapsed so far this month (the % denominator). */
  weekdaysElapsed: number;
  /** present ÷ weekdaysElapsed, 0–100, rounded. */
  attendancePercent: number;
}

const PRESENT_STATUSES = new Set(['FULL_DAY', 'PARTIAL_DAY', 'OPEN']);

/** Count of Mon–Fri from the 1st of `now`'s month through `now` inclusive. */
function weekdaysElapsedThisMonth(now: Date): number {
  let count = 0;
  for (let day = 1; day <= now.getDate(); day += 1) {
    const weekday = new Date(now.getFullYear(), now.getMonth(), day).getDay();
    if (weekday !== 0 && weekday !== 6) {
      count += 1;
    }
  }
  return count;
}

export function computeMonthlyStats(
  days: readonly AttendanceStatSource[],
  now: Date = new Date(),
): MonthlyStats {
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisMonth = days.filter((day) => day.date?.startsWith(monthPrefix));

  let present = 0;
  let fullDays = 0;
  let partialDays = 0;
  let missed = 0;
  let late = 0;
  for (const day of thisMonth) {
    if (day.status && PRESENT_STATUSES.has(day.status)) {
      present += 1;
    }
    if (day.status === 'FULL_DAY') {
      fullDays += 1;
    }
    if (day.status === 'PARTIAL_DAY') {
      partialDays += 1;
    }
    if (day.status === 'MISSED') {
      missed += 1;
    }
    if (day.isLate) {
      late += 1;
    }
  }

  const weekdaysElapsed = weekdaysElapsedThisMonth(now);
  const attendancePercent =
    weekdaysElapsed > 0 ? Math.min(100, Math.round((present / weekdaysElapsed) * 100)) : 0;

  return { present, fullDays, partialDays, missed, late, weekdaysElapsed, attendancePercent };
}
