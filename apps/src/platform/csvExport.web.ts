/**
 * Web counterpart to csvExport.native.ts (Phase 3, ADR-014) — fetches the
 * CSV then hands it to the shared `saveAndShareFile` primitive (task 4.5),
 * which triggers the standard browser download pattern (Blob + a
 * programmatically-clicked anchor), rather than duplicating that
 * mechanism here.
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
