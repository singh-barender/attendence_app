/**
 * Pothos object type for the derived (non-Prisma-column) enrollment-status
 * shape `enrollmentService.getEnrollmentStatus` computes from
 * BiometricEnrollment rows — used by `User.enrollmentStatus` (the
 * authenticated profile view, task 4.1). Kept as its own nested type rather
 * than two flat booleans on User directly, so a client reading `me` gets
 * both fields from the single underlying enrollment lookup instead of two
 * independent field resolvers each re-querying BiometricEnrollment.
 */
import type { EnrollmentStatus } from '../../services/enrollmentService';
import { builder } from '../builder';

export const EnrollmentStatusRef = builder
  .objectRef<EnrollmentStatus>('EnrollmentStatus')
  .implement({
    fields: (t) => ({
      faceEnrolled: t.exposeBoolean('faceEnrolled'),
      fingerprintEnrolled: t.exposeBoolean('fingerprintEnrolled'),
    }),
  });
