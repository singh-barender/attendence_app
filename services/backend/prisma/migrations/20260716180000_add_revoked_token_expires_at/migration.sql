-- AlterTable
-- Existing rows (if any) predate expiresAt tracking. SQLite's ALTER TABLE
-- ADD COLUMN rejects a non-constant default (e.g. CURRENT_TIMESTAMP) when
-- backfilling existing rows, so a fixed epoch literal is used instead —
-- this backfills any pre-existing row to a timestamp already in the past,
-- making it immediately eligible for the next opportunistic sweep rather
-- than lingering with a fabricated future date.
ALTER TABLE "RevokedToken" ADD COLUMN "expiresAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00';
