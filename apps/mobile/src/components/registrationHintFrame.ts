/**
 * Shared frame dimensions for the registration-wizard tutorial hints
 * (`FaceAngleHint` on Step 3, `FingerprintScanHint` on Step 2) — a single
 * source rather than each hint hardcoding its own copy of the same numbers,
 * which is exactly how they drifted out of sync the first time (task 4.13
 * follow-up: the two hints appeared with different frame sizes because each
 * had its own locally-duplicated constant).
 */
export const HINT_FRAME_WIDTH = 160;
export const HINT_FRAME_HEIGHT = 190;
export const HINT_FRAME_RADIUS = 20;
