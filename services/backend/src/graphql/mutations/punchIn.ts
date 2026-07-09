/**
 * punchInFingerprint and punchInFace — the two biometric punch-in paths,
 * sharing one `PunchInResult` shape.
 *
 * punchInFingerprint: verification already happened client-side (the OS
 * BiometricPrompt, ADR-005); the server trusts that attestation but still
 * checks the account actually has a fingerprint enrolled, logs the
 * verification attempt either way (ADR-019), and is authoritative for
 * punch-type inference (ADR-016).
 *
 * punchInFace: unlike fingerprint, the server does NOT trust the client's
 * own match judgment — it independently re-runs `packages/face-matching`'s
 * `isMatch()` against this user's own enrolled embeddings (task 2.4/2.8) and
 * that re-verification, not anything computed client-side, is what decides
 * success/failure (ADR-007 — "the actual security boundary of the app").
 * The client's live embedding is trusted as *input* (a photo was captured
 * and locally embedded), but never as a *match decision*.
 */
import { isMatch, MATCH_THRESHOLD } from '@attendance-app/face-matching';
import type { AttendanceRecord } from '../../generated/prisma/client';
import * as attendanceService from '../../services/attendanceService';
import * as enrollmentService from '../../services/enrollmentService';
import { issueSessionToken } from '../../services/tokenService';
import { builder } from '../builder';
import { AttendanceRecordRef } from '../types/AttendanceRecord';
import { PunchTypeEnum } from '../types/enums';

export interface PunchInResultShape {
  token: string;
  record: AttendanceRecord;
  type: attendanceService.PunchType;
  matched: boolean;
  bestScore: number | null;
}

const PunchInResult = builder.objectRef<PunchInResultShape>('PunchInResult').implement({
  fields: (t) => ({
    token: t.exposeString('token'),
    record: t.field({ type: AttendanceRecordRef, resolve: (result) => result.record }),
    type: t.field({ type: PunchTypeEnum, resolve: (result) => result.type }),
    matched: t.exposeBoolean('matched'),
    bestScore: t.exposeFloat('bestScore', { nullable: true }),
  }),
});

builder.mutationField('punchInFingerprint', (t) =>
  t.field({
    type: PunchInResult,
    args: {
      userId: t.arg.id({ required: true }),
      latitude: t.arg.float(),
      longitude: t.arg.float(),
    },
    resolve: async (_root, args): Promise<PunchInResultShape> => {
      const userId = String(args.userId);
      const { fingerprintEnrolled } = await enrollmentService.getEnrollmentStatus(userId);

      if (!fingerprintEnrolled) {
        await attendanceService.logVerificationAttempt({
          userId,
          method: attendanceService.VERIFICATION_METHOD.FINGERPRINT,
          outcome: attendanceService.VERIFICATION_OUTCOME.FAILURE,
        });
        throw new Error('Fingerprint is not enrolled for this account');
      }

      await attendanceService.logVerificationAttempt({
        userId,
        method: attendanceService.VERIFICATION_METHOD.FINGERPRINT,
        outcome: attendanceService.VERIFICATION_OUTCOME.SUCCESS,
      });

      const { record, type } = await attendanceService.recordPunch({
        userId,
        method: attendanceService.VERIFICATION_METHOD.FINGERPRINT,
        latitude: args.latitude ?? null,
        longitude: args.longitude ?? null,
      });

      const token = await issueSessionToken(userId);

      return { token, record, type, matched: true, bestScore: null };
    },
  }),
);

builder.mutationField('punchInFace', (t) =>
  t.field({
    type: PunchInResult,
    args: {
      userId: t.arg.id({ required: true }),
      embedding: t.arg.floatList({ required: true }),
      latitude: t.arg.float(),
      longitude: t.arg.float(),
    },
    resolve: async (_root, args): Promise<PunchInResultShape> => {
      const userId = String(args.userId);
      const enrolledEmbeddings = await enrollmentService.getFaceEmbeddings(userId);

      if (enrolledEmbeddings.length === 0) {
        await attendanceService.logVerificationAttempt({
          userId,
          method: attendanceService.VERIFICATION_METHOD.FACE,
          outcome: attendanceService.VERIFICATION_OUTCOME.FAILURE,
        });
        throw new Error('Face is not enrolled for this account');
      }

      const { matched, bestScore } = isMatch(args.embedding, enrolledEmbeddings, MATCH_THRESHOLD);

      await attendanceService.logVerificationAttempt({
        userId,
        method: attendanceService.VERIFICATION_METHOD.FACE,
        outcome: matched
          ? attendanceService.VERIFICATION_OUTCOME.SUCCESS
          : attendanceService.VERIFICATION_OUTCOME.FAILURE,
        matchScore: bestScore,
      });

      if (!matched) {
        throw new Error('Face did not match your enrolled profile');
      }

      const { record, type } = await attendanceService.recordPunch({
        userId,
        method: attendanceService.VERIFICATION_METHOD.FACE,
        matchScore: bestScore,
        latitude: args.latitude ?? null,
        longitude: args.longitude ?? null,
      });

      const token = await issueSessionToken(userId);

      return { token, record, type, matched, bestScore };
    },
  }),
);
