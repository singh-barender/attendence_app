-- CreateIndex
-- Backs `findMostRecentPunch` (attendanceService.ts) — punch-type inference
-- no longer scopes to a calendar date (Round 7 review finding: a shift
-- crossing midnight was misread as two unrelated days), so it now queries
-- this user's single most recent punch ordered by `timestamp` instead.
CREATE INDEX "AttendanceRecord_userId_timestamp_idx" ON "AttendanceRecord"("userId", "timestamp");
