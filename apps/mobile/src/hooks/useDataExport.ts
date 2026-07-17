/**
 * Self-service data export (ADR-020), split out of `ProfileScreen`
 * (coding-standards.md's "small, modular, single-responsibility files") —
 * `exportMyData` is deliberately not auto-fetched (`enabled: false`), it's
 * an on-demand action triggered by the Download button, not something every
 * profile visit needs.
 */
import { useState } from 'react';
import { useExportMyDataQuery } from '../generated/graphql';
import { saveMyDataExport } from '../platform/dataExport';
import { getErrorMessage } from '../services/graphqlError';

export function useDataExport() {
  const { refetch: fetchExportData } = useExportMyDataQuery(undefined, { enabled: false });
  const [isDownloadingData, setIsDownloadingData] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownloadData() {
    setDownloadError(null);
    setIsDownloadingData(true);
    try {
      const result = await fetchExportData();
      if (result.error) {
        throw result.error;
      }
      if (!result.data?.exportMyData) {
        throw new Error('No data returned.');
      }
      await saveMyDataExport(result.data.exportMyData);
    } catch (err) {
      setDownloadError(getErrorMessage(err, 'Failed to export your data.'));
    } finally {
      setIsDownloadingData(false);
    }
  }

  return { isDownloadingData, downloadError, handleDownloadData };
}
