/**
 * Shared display formatting for attendance history (task 1.19) — one place
 * so every screen that shows a punch date/time formats it identically.
 */
export function formatPunchTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDisplayDate(dateOnly: string): string {
  return new Date(`${dateOnly}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatHoursWorked(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${wholeHours}h ${minutes}m`;
}

export function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** `monthIndex` is 0-based (January = 0), matching `Date`'s own convention —
 * used by `AttendanceCalendar`'s month-grid title (task 4.3). */
export function formatMonthYear(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

/** Zero-padded `YYYY-MM-DD` for a given year/0-based-month/day-of-month —
 * the inverse of `formatDisplayDate`'s parsing, used to key attendance days
 * by date when building a month grid (task 4.3). */
export function toDateOnlyString(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Combined date+time, unlike `formatPunchTime` (time only) — verification
 * attempts (task 4.4) can span many different days, so the date needs to
 * stay visible, not just the time-of-day. */
export function formatAttemptTimestamp(iso: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${datePart}, ${formatPunchTime(iso)}`;
}

/** "X ago" for a recent timestamp (task 4.13 follow-up — ProfileScreen's
 * "Last verified" indicator); falls back to `formatAttemptTimestamp`'s
 * absolute date+time beyond a week, where "9d ago" stops being more useful
 * than just the date. */
export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) {
    return 'Just now';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return formatAttemptTimestamp(iso);
}
