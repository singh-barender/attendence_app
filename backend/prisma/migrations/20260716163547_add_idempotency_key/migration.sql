-- AlterTable
ALTER TABLE "AttendanceRecord" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_idempotencyKey_key" ON "AttendanceRecord"("idempotencyKey");
