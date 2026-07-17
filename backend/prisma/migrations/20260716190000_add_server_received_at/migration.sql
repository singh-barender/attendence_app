-- AlterTable
-- Constant literal default (not CURRENT_TIMESTAMP) — SQLite rejects a
-- non-constant default on ALTER TABLE ADD COLUMN when backfilling existing
-- rows (hit this exact error once already, see the RevokedToken.expiresAt
-- migration). Backfilled immediately below with the real prior value.
ALTER TABLE "AttendanceRecord" ADD COLUMN "serverReceivedAt" DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00';

-- Backfill: every row created before this column existed had `timestamp`
-- as its true (and only) server-received instant — this migration is what
-- starts letting the two diverge going forward.
UPDATE "AttendanceRecord" SET "serverReceivedAt" = "timestamp";
