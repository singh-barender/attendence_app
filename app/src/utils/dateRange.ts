/**
 * Date-range presets for the CSV export (Today / This Week / This Month /
 * All Time). Pure and device-local: it turns a preset + "now" into inclusive
 * YYYY-MM-DD `from`/`to` bounds the export route understands (`?from=&to=`).
 * "All Time" returns no bounds. Kept separate from the export I/O so the
 * boundary math (week start, month start) is unit-testable without a network
 * call.
 */
export type ExportRangePreset = 'today' | 'week' | 'month' | 'all';

export interface DateRangeBounds {
  from?: string;
  to?: string;
}

export const EXPORT_RANGE_PRESETS: { readonly key: ExportRangePreset; readonly label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'all', label: 'All Time' },
];

function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Monday of the week containing `date` (ISO week start), in local time. */
function startOfWeek(date: Date): Date {
  const result = new Date(date);
  // getDay(): 0=Sun..6=Sat; shift so Monday is the week's first day.
  const daysSinceMonday = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - daysSinceMonday);
  return result;
}

/** Resolves a preset into inclusive bounds. Bounded presets run from their
 * start up to and including `now` (never into the future, where no records
 * exist anyway). */
export function getDateRange(preset: ExportRangePreset, now: Date = new Date()): DateRangeBounds {
  const today = toDateString(now);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'week':
      return { from: toDateString(startOfWeek(now)), to: today };
    case 'month': {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toDateString(firstOfMonth), to: today };
    }
    case 'all':
      return {};
  }
}
