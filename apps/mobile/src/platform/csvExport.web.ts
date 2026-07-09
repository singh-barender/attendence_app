/**
 * Web counterpart to csvExport.native.ts (Phase 3, ADR-014) — browsers have
 * neither a native share sheet nor a general filesystem API, so this
 * triggers the standard browser download pattern instead: wrap the fetched
 * CSV in a Blob, point a hidden anchor's `download` attribute at an object
 * URL for it, and programmatically click it.
 */
import { loadToken } from '../services/tokenStorage';
import { getApiUrl } from '../utils/apiUrl';
import { formatBearerHeader } from '../utils/authHeader';
import { EXPORT_FILENAME } from './csvExportConstants';

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

  const blobUrl = URL.createObjectURL(new Blob([csvText], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = EXPORT_FILENAME;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}
