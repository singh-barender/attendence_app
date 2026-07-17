/**
 * Shared between csvExport.native.ts and csvExport.web.ts — only one of the
 * two is ever bundled for a given platform, but the request-shaping and
 * filename-handling logic is identical, so it lives here rather than being
 * duplicated across the two.
 */
import type { DateRangeBounds } from '../utils/dateRange';

/** Used only if the server response carries no usable filename header. */
export const DEFAULT_EXPORT_FILENAME = 'attendance.csv';

/** Turns the selected date-range preset's bounds into the export route's
 * `?from=&to=` query string (empty string for "All Time"). */
export function buildExportQuery(range: DateRangeBounds): string {
  const params = new URLSearchParams();
  if (range.from) {
    params.set('from', range.from);
  }
  if (range.to) {
    params.set('to', range.to);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

/** Extracts the server-derived download filename (e.g.
 * `Jordan_Rivera_July_2026_Attendance.csv`) from a Content-Disposition
 * header, falling back to the default if it's missing/unparseable. */
export function filenameFromContentDisposition(header: string | null): string {
  if (!header) {
    return DEFAULT_EXPORT_FILENAME;
  }
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  return match?.[1] ?? DEFAULT_EXPORT_FILENAME;
}
