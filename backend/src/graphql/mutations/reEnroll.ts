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
 *
 * Both also require a `stepUpToken` (architecture-review-2026-07-16.md's
 * F11) — a merely-valid session token isn't enough on its own to authorize
 * replacing an account's biometric reference data (a stolen/leftover token,
 * or an unattended unlocked device, would otherwise let anyone permanently
 * hijack face/fingerprint verification for that account with no further
 * proof required). `verifyStepUpToken` throws on a missing/expired/wrong/
 * already-used token, and its resolved userId is checked against the
 * session's own — a step-up token is only ever valid for the account that
 * confirmed it.
 *
 * A step-up token is consumed (revoked) immediately once it authorizes a
 * mutation here — without this, the same 5-minute-lived token could be
 * replayed to re-enroll face *and* fingerprint, or the same biometric
 * repeatedly, from a single password confirmation (a follow-up review
 * finding on F11). The frontend already gets a fresh token per screen
 * (`StepUpPasswordConfirmation`, one per re-enrollment flow), so this
 * doesn't cost any legitimate use a second password prompt. `assertStepUp`
 * itself lives in `tokenService.ts` — `deleteMyAccount` needs the identical
 * check, not a second copy of it.
 *
 * Each delegates to enrollmentService's supersede-then-append logic and
 * returns the freshly recomputed EnrollmentStatus so the client doesn't
 * need a second round-trip to reflect the change.
 */
import * as enrollmentService from '../../services/enrollmentService';
import { assertStepUp } from '../../services/tokenService';
import { builder } from '../builder';
import { requireUserId } from '../context';
import { EnrollmentStatusRef } from '../types/EnrollmentStatus';
import { EmbeddingModelEnum } from '../types/enums';
import { FaceEmbeddingsInput } from './register';

builder.mutationField('reEnrollFingerprint', (t) =>
  t.field({
    type: EnrollmentStatusRef,
    args: {
      stepUpToken: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const userId = requireUserId(ctx);
      await assertStepUp(userId, args.stepUpToken);
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
      embeddingModel: t.arg({ type: EmbeddingModelEnum, required: true }),
      stepUpToken: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const userId = requireUserId(ctx);
      await assertStepUp(userId, args.stepUpToken);
      await enrollmentService.reEnrollFace(userId, args.embeddings, args.embeddingModel);
      return enrollmentService.getEnrollmentStatus(userId);
    },
  }),
);
