/**
 * Shared between csvExport.native.ts and csvExport.web.ts — only one of
 * the two is ever bundled for a given platform, but the filename itself
 * has no reason to differ, so it lives here rather than being duplicated.
 */
export const EXPORT_FILENAME = 'attendance.csv';
