/**
 * `exportMyData`'s composite result shape (task 4.5, ADR-020) — bundles
 * everything requirements.md scopes the export to: profile, enrollment
 * metadata, attendance records, and verification attempts. A hand-rolled
 * `objectRef` (not a Prisma model of its own) since this is a query-time
 * composition of four otherwise-unrelated reads, reusing the existing
 * `User`/`AttendanceRecord`/`VerificationAttempt` Pothos types by name so
 * the export's shape for each piece never drifts from what those types
 * already expose elsewhere in the schema.
 */
import type { AttendanceRecord, User, VerificationAttempt } from '../../generated/prisma/client';
import { builder } from '../builder';
import { AttendanceRecordRef } from './AttendanceRecord';
import type { EnrollmentMetadataShape } from './EnrollmentMetadata';
import { EnrollmentMetadataRef } from './EnrollmentMetadata';
import { UserRef } from './User';
import { VerificationAttemptRef } from './VerificationAttempt';

export interface MyDataExportShape {
  profile: User;
  enrollments: EnrollmentMetadataShape[];
  attendanceRecords: AttendanceRecord[];
  verificationAttempts: VerificationAttempt[];
}

export const MyDataExportRef = builder.objectRef<MyDataExportShape>('MyDataExport').implement({
  fields: (t) => ({
    profile: t.field({ type: UserRef, resolve: (data) => data.profile }),
    enrollments: t.field({
      type: [EnrollmentMetadataRef],
      resolve: (data) => data.enrollments,
    }),
    attendanceRecords: t.field({
      type: [AttendanceRecordRef],
      resolve: (data) => data.attendanceRecords,
    }),
    verificationAttempts: t.field({
      type: [VerificationAttemptRef],
      resolve: (data) => data.verificationAttempts,
    }),
  }),
});
