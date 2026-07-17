/**
 * `exportMyData` — the full personal-data export (task 4.5, ADR-020):
 * profile, enrollment metadata, attendance records, and verification
 * attempts, all for the authenticated user. A normal GraphQL query
 * returning structured JSON, not the plain CSV route (ADR-014's one
 * deliberate exception is for the spreadsheet-native attendance report
 * specifically — this is a different concern, so it doesn't get the same
 * file-download treatment; architecture.md is explicit about this split).
 * Reuses `getAllAttendanceRecords` (the same flat per-punch list the CSV
 * export already builds) rather than re-deriving attendance data a third
 * way alongside `attendanceHistory`'s grouped-by-day shape.
 */
import { prisma } from '../../db/client';
import { getAllAttendanceRecords } from '../../services/attendanceReportingService';
import { builder } from '../builder';
import { requireUserId } from '../context';
import type { MyDataExportShape } from '../types/MyDataExport';
import { MyDataExportRef } from '../types/MyDataExport';

builder.queryField('exportMyData', (t) =>
  t.field({
    type: MyDataExportRef,
    resolve: async (_root, _args, ctx): Promise<MyDataExportShape> => {
      const userId = requireUserId(ctx);

      const [profile, enrollments, attendanceRecords, verificationAttempts] = await Promise.all([
        prisma.user.findUniqueOrThrow({ where: { id: userId } }),
        prisma.biometricEnrollment.findMany({
          where: { userId },
          select: { type: true, createdAt: true, supersededAt: true },
        }),
        getAllAttendanceRecords(userId),
        prisma.verificationAttempt.findMany({
          where: { userId },
          orderBy: { timestamp: 'desc' },
        }),
      ]);

      return { profile, enrollments, attendanceRecords, verificationAttempts };
    },
  }),
);
