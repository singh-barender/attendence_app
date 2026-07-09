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
import { EXPORT_FILENAME } from './csvExportConstants';
import { saveAndShareFile } from './fileExport';

export async function exportAttendanceCsv(): Promise<void> {
  const token = await loadToken();
  if (!token) {
    throw new Error('Check in first — exporting requires an active session.');
  }

  const response = await fetch(`${getApiUrl()}/export/attendance.csv`, {
    headers: { Authorization: formatBearerHeader(token) },
  });
  if (!response.ok) {
    throw new Error(`Export failed (HTTP ${response.status}).`);
  }
  const csvText = await response.text();

  await saveAndShareFile(csvText, EXPORT_FILENAME, 'text/csv');
}
