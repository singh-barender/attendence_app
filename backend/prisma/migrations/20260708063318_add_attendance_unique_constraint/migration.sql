-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_userId_date_type_key" ON "AttendanceRecord"("userId", "date", "type");
