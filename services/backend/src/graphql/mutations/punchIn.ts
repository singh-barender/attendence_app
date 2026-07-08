/**
 * punchInFingerprint — fingerprint verification already happened
 * client-side (the OS BiometricPrompt, ADR-005); the server trusts that
 * attestation but still checks the account actually has a fingerprint
 * enrolled, logs the verification attempt either way (ADR-019), and is
 * authoritative for punch-type inference (ADR-016). `punchInFace` (Phase 2)
 * follows the same shape once real embeddings exist to re-verify (ADR-007).
 */
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
