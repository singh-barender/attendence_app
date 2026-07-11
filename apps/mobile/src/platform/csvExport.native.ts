/**
 * CSV export share flow (task 1.20, architecture.md) — fetches the one
 * plain HTTP route this app has (ADR-014), then hands the response text to
 * the shared `saveAndShareFile` primitive (task 4.5) rather than
 * duplicating the file-write/share-sheet mechanism here. Android-only
 * file; a `csvExport.web.ts` counterpart (Phase 3) triggers a browser
 * download instead, since there's neither a native share sheet nor a
 * filesystem API on the web.
 */

import { loadToken } from '../services/tokenStorage';
import { getApiUrl } from '../utils/apiUrl';
import { formatBearerHeader } from '../utils/authHeader';
import type { DateRangeBounds } from '../utils/dateRange';
import { buildExportQuery, filenameFromContentDisposition } from './csvExportConstants';
import { saveAndShareFile } from './fileExport';

export async function exportAttendanceCsv(range: DateRangeBounds = {}): Promise<void> {
  const token = await loadToken();
  if (!token) {
    throw new Error('Check in first — exporting requires an active session.');
  }

  const response = await fetch(`${getApiUrl()}/export/attendance.csv${buildExportQuery(range)}`, {
    headers: { Authorization: formatBearerHeader(token) },
  });
  if (!response.ok) {
    throw new Error(`Export failed (HTTP ${response.status}).`);
  }
  const csvText = await response.text();
  const filename = filenameFromContentDisposition(response.headers.get('content-disposition'));

  await saveAndShareFile(csvText, filename, 'text/csv');
}
