/**
 * "Download my data" (task 4.5, ADR-020) — serializes the `exportMyData`
 * query result and hands it to the shared `saveAndShareFile` primitive.
 * No platform split needed here: the only platform-specific part (how a
 * text file actually gets saved/shared) is already isolated inside
 * `fileExport.native.ts`/`.web.ts`.
 */

import { DATA_EXPORT_FILENAME } from './dataExportConstants';
import { saveAndShareFile } from './fileExport';

export async function saveMyDataExport(data: unknown): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  await saveAndShareFile(json, DATA_EXPORT_FILENAME, 'application/json');
}
