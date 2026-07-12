/**
 * reEnrollFingerprint/reEnrollFace — the profile-screen re-enrollment
 * action (task 4.2, ADR-018): lets a user redo face and/or fingerprint
 * enrollment at any time (new device, changed appearance, hardware
 * change). Unlike registerStep2/registerStep3 (which take a client-supplied
 * `userId` because they run before a session token exists), these resolve
 * the user from the authenticated session via `requireUserId`, the same
 * choke point `me`/`attendanceHistory` use — there is no client-side
 * `userId` available post-login to pass instead, and letting the client
 * supply one would let it re-enroll biometrics for an arbitrary account.
 * Each delegates to enrollmentService's supersede-then-append logic and
 * returns the freshly recomputed EnrollmentStatus so the client doesn't
 * need a second round-trip to reflect the change.
 */
import * as enrollmentService from '../../services/enrollmentService';
import { builder } from '../builder';
import { requireUserId } from '../context';
import { EnrollmentStatusRef } from '../types/EnrollmentStatus';
import { FaceEmbeddingsInput } from './register';

builder.mutationField('reEnrollFingerprint', (t) =>
  t.field({
    type: EnrollmentStatusRef,
    resolve: async (_root, _args, ctx) => {
      const userId = requireUserId(ctx);
      await enrollmentService.reEnrollFingerprint(userId);
      return enrollmentService.getEnrollmentStatus(userId);
    },
  }),
);

builder.mutationField('reEnrollFace', (t) =>
  t.field({
    type: EnrollmentStatusRef,
    args: {
      embeddings: t.arg({ type: FaceEmbeddingsInput, required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const userId = requireUserId(ctx);
      await enrollmentService.reEnrollFace(userId, args.embeddings);
      return enrollmentService.getEnrollmentStatus(userId);
    },
  }),
);
