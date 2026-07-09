/**
 * Web counterpart to fileExport.native.ts (task 4.5) — browsers have
 * neither a native share sheet nor a general filesystem API, so this
 * triggers the standard browser download pattern instead: wrap the content
 * in a Blob, point a hidden anchor's `download` attribute at an object URL
 * for it, and programmatically click it. Extracted from csvExport.web.ts.
 */
export async function saveAndShareFile(
  content: string,
  filename: string,
  mimeType: string,
): Promise<void> {
  const blobUrl = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}
