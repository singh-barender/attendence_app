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
 *
 * It also independently re-verifies liveness (architecture-review-2026-07-16
 * .md's F1) — the client's own `detected` boolean from its liveness
 * challenge was, until now, never checked server-side, meaning an embedding
 * computed from any static photo (submitted directly against the API,
 * bypassing the app's camera/challenge entirely) could pass as long as it
 * matched an enrolled embedding. `judgeLiveness` re-runs the same
 * `@attendance-app/liveness` decision function against the actual sample
 * window the client claims completed the challenge, and this check runs
 * *before* the embedding match — a failed liveness re-check rejects the
 * punch without ever reaching the match logic.
 *
 * `embeddingModel` (F3) scopes `getFaceEmbeddings` to only the enrolled
 * embeddings produced by the same model as this live one — Android
 * (MobileFaceNet) and web (Human FaceRes) are independently-trained models
 * with incompatible embedding spaces (ADR-006), so comparing across them
 * would previously have thrown (dimension mismatch) or, worse, produced a
 * meaningless score. An account enrolled on one platform but verifying on
 * the other now gets a clear, actionable message instead.
 *
 * `idempotencyKey` (F7) is optional — supplying one lets a retried offline
 * mutation that actually already succeeded (response lost in transit) return
 * the original record instead of re-inferring punch type against now-changed
 * state. Each resolver checks `findPunchByIdempotencyKey` itself, first
 * thing, before any liveness/enrollment work or audit logging (Round 6
 * review finding) — `recordPunch` also checks it again internally as the
 * actual write-path safeguard against a race between two concurrent
 * replays. See the column comment in schema.prisma and
 * `findPunchByIdempotencyKey`/`recordPunch`'s own doc comments.
 *
 * Neither mutation issues a session token anymore (a follow-up review
 * finding on F7/F8): both require an already-authenticated session to be
 * called at all (`assertPunchIdentity`), so under ADR-030 a punch is no
 * longer an authentication event the way it was pre-ADR-030 — issuing a
 * fresh token on every punch just left the previous one behind as a still-
 * valid, unrevoked, orphaned credential (the client replaced its stored
 * token, but nothing told the server the old one was no longer wanted),
 * accumulating one extra live token per punch with no way to revoke them
 * as a group. Since the caller's existing session token remains valid and
 * untouched throughout, there is nothing to rotate.
 *
 * `clientTimestamp` (two rounds of follow-up review findings, offline sync
 * date-drift) is optional — when present and plausible, `recordPunch`
 * resolves it into the single effective instant used for both which *day*
 * this punch belongs to (CHECK_IN-vs-CHECK_OUT inference) and the stored
 * `timestamp` itself (displayed check-in/out times, CSV export, hours-
 * worked, lateness). Without this, a punch queued while offline and resumed
 * after local midnight got bucketed against the wrong day, and — even once
 * date-bucketing alone was fixed — a whole offline-batched day synced at
 * once produced a self-contradictory result (near-zero hours worked, a
 * false "late" flag, wrong displayed clock times) because the stored
 * timestamp still reflected server-receipt time. The true receipt instant
 * isn't discarded — `AttendanceRecord.serverReceivedAt` keeps it as a
 * hidden forensic fact never exposed via GraphQL. See
 * `resolvePunchTimestamp`'s doc comment in attendanceService.ts for the
 * full reasoning and its trust-boundary scope.
 */
import { isMatch } from '@attendance-app/face-matching';
import { config } from '../../config';
import type { AttendanceRecord } from '../../generated/prisma/client';
import * as attendanceService from '../../services/attendanceService';
import * as enrollmentService from '../../services/enrollmentService';
import { judgeLiveness } from '../../services/livenessVerificationService';
import { builder } from '../builder';
import type { GraphQLContext } from '../context';
import { AttendanceRecordRef } from '../types/AttendanceRecord';
import { EmbeddingModelEnum, PunchTypeEnum } from '../types/enums';
import {
  LivenessChallengeTypeEnum,
  LivenessSampleInput,
  toLivenessSample,
} from '../types/liveness';
import { DateTimeScalar } from '../types/scalars';

/**
 * Punches now require an authenticated session and may only be for the
 * caller's *own* account (ADR-030): you log in with email+password first, then
 * punch from the dashboard. This closes the attendance-fraud paths entirely —
 * an unauthenticated request (no token) is rejected, and an authenticated one
 * can't punch for a different `userId` (e.g. checking someone else out). The
 * biometric verification the resolver runs after this is still the attendance
 * event and its own security boundary (ADR-004/ADR-007), unchanged.
 */
function assertPunchIdentity(ctx: GraphQLContext, userId: string): void {
  if (!ctx.userId) {
    throw new Error('Log in before checking in or out.');
  }
  if (ctx.userId !== userId) {
    throw new Error('This session can only punch for its own account. Log out first.');
  }
}

export interface PunchInResultShape {
  record: AttendanceRecord;
  type: attendanceService.PunchType;
  matched: boolean;
  bestScore: number | null;
}

const PunchInResult = builder.objectRef<PunchInResultShape>('PunchInResult').implement({
  fields: (t) => ({
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
      idempotencyKey: t.arg.string(),
      clientTimestamp: t.arg({ type: DateTimeScalar }),
      latitude: t.arg.float(),
      longitude: t.arg.float(),
      address: t.arg.string(),
    },
    resolve: async (_root, args, ctx): Promise<PunchInResultShape> => {
      const userId = String(args.userId);
      assertPunchIdentity(ctx, userId);

      // Checked before any liveness/enrollment work or audit logging (Round
      // 6 review finding) — a replayed idempotency key means this exact
      // attempt already succeeded once; returning the cached record here
      // skips re-running verification *and* re-logging a SUCCESS attempt,
      // so a network retry can never inflate the audit trail with a
      // phantom extra "verified again" event.
      if (args.idempotencyKey) {
        const existing = await attendanceService.findPunchByIdempotencyKey(
          userId,
          args.idempotencyKey,
        );
        if (existing) {
          return { record: existing.record, type: existing.type, matched: true, bestScore: null };
        }
      }

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
        address: args.address ?? null,
        idempotencyKey: args.idempotencyKey ?? null,
        clientTimestamp: args.clientTimestamp ?? null,
      });

      return { record, type, matched: true, bestScore: null };
    },
  }),
);

builder.mutationField('punchInFace', (t) =>
  t.field({
    type: PunchInResult,
    args: {
      userId: t.arg.id({ required: true }),
      embedding: t.arg.floatList({ required: true }),
      embeddingModel: t.arg({ type: EmbeddingModelEnum, required: true }),
      livenessChallengeType: t.arg({ type: LivenessChallengeTypeEnum, required: true }),
      livenessSamples: t.arg({ type: [LivenessSampleInput], required: true }),
      idempotencyKey: t.arg.string(),
      clientTimestamp: t.arg({ type: DateTimeScalar }),
      latitude: t.arg.float(),
      longitude: t.arg.float(),
      address: t.arg.string(),
    },
    resolve: async (_root, args, ctx): Promise<PunchInResultShape> => {
      const userId = String(args.userId);
      assertPunchIdentity(ctx, userId);

      // See the matching check in `punchInFingerprint` above — same reason,
      // checked before liveness/match work and before any audit logging.
      if (args.idempotencyKey) {
        const existing = await attendanceService.findPunchByIdempotencyKey(
          userId,
          args.idempotencyKey,
        );
        if (existing) {
          return {
            record: existing.record,
            type: existing.type,
            matched: true,
            bestScore: existing.record.matchScore,
          };
        }
      }

      const livenessPassed = judgeLiveness(
        args.livenessChallengeType,
        args.livenessSamples.map(toLivenessSample),
      );
      if (!livenessPassed) {
        await attendanceService.logVerificationAttempt({
          userId,
          method: attendanceService.VERIFICATION_METHOD.FACE,
          outcome: attendanceService.VERIFICATION_OUTCOME.FAILURE,
        });
        throw new Error('Liveness check failed — please try again.');
      }

      const enrolledEmbeddings = await enrollmentService.getFaceEmbeddings(
        userId,
        args.embeddingModel,
      );

      if (enrolledEmbeddings.length === 0) {
        await attendanceService.logVerificationAttempt({
          userId,
          method: attendanceService.VERIFICATION_METHOD.FACE,
          outcome: attendanceService.VERIFICATION_OUTCOME.FAILURE,
        });
        // Distinguishes "never enrolled face at all" from "enrolled, but not
        // on this platform" (architecture-review-2026-07-16.md's F3) — the
        // latter needs a message that tells the user what to actually do
        // (re-enroll here, or use the platform they originally enrolled on)
        // rather than implying they've never enrolled face at all.
        const hasAnyEnrollment = await enrollmentService.hasAnyFaceEnrollment(userId);
        throw new Error(
          hasAnyEnrollment
            ? "Face verification isn't set up on this platform for your account yet — re-enroll your face here, or use the platform you originally enrolled on."
            : 'Face is not enrolled for this account',
        );
      }

      const { matched, bestScore } = isMatch(
        args.embedding,
        enrolledEmbeddings,
        config.faceMatchThreshold,
      );

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
        address: args.address ?? null,
        idempotencyKey: args.idempotencyKey ?? null,
        clientTimestamp: args.clientTimestamp ?? null,
      });

      return { record, type, matched, bestScore };
    },
  }),
);
