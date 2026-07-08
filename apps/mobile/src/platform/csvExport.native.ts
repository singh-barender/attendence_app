/**
 * CSV export share flow (task 1.20, architecture.md) — fetches the one
 * plain HTTP route this app has (ADR-014), writes the response to a temp
 * file, and opens the native share sheet. Android-only file; a
 * `csvExport.web.ts` counterpart (Phase 3) triggers a browser download
 * instead, since there's neither a native share sheet nor this filesystem
 * API on the web.
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { loadToken } from '../services/tokenStorage.native';
import { getApiUrl } from '../utils/apiUrl';
import { formatBearerHeader } from '../utils/authHeader';

const EXPORT_FILENAME = 'attendance.csv';

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

  const file = new File(Paths.cache, EXPORT_FILENAME);
  file.create({ overwrite: true });
  file.write(csvText);

  const isSharingAvailable = await Sharing.isAvailableAsync();
  if (!isSharingAvailable) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: 'Export Attendance CSV',
  });
}
