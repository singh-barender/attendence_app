-- AlterTable
ALTER TABLE "BiometricEnrollment" ADD COLUMN "embeddingModel" TEXT;

-- Backfill: every face embedding captured before this migration was
-- enrolled on Android (this project's phase-1, actually-tested platform per
-- CLAUDE.md) — tag existing FACE_* rows accordingly so they remain matchable
-- rather than silently excluded by the new same-model filter
-- (architecture-review-2026-07-16.md's F3). FINGERPRINT_FLAG rows have no
-- embedding at all and are correctly left untouched (NULL).
UPDATE "BiometricEnrollment"
SET "embeddingModel" = 'MOBILEFACENET_128'
WHERE "type" IN ('FACE_LEFT', 'FACE_RIGHT', 'FACE_FRONTAL');
