/**
 * Shared "write this text content to a file, then open the native share
 * sheet" primitive — extracted from csvExport.native.ts (task 4.5) so
 * exportMyData's JSON download (and any future text-content export) reuses
 * the exact same mechanism instead of a second copy differing only in
 * filename/MIME type. The dialog title is intentionally generic rather
 * than a caller-supplied parameter, so this file's exported signature stays
 * identical to fileExport.web.ts's (Metro's platform resolution requires
 * both sides of a `.native`/`.web` split to share one interface).
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function saveAndShareFile(
  content: string,
  filename: string,
  mimeType: string,
): Promise<void> {
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(content);

  const isSharingAvailable = await Sharing.isAvailableAsync();
  if (!isSharingAvailable) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Export' });
}
