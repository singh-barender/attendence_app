/**
 * `deleteMyAccount` — permanently deletes the authenticated user's row
 * (task 4.6, ADR-020). `onDelete: Cascade` is already configured in
 * schema.prisma on every child relation (BiometricEnrollment,
 * AttendanceRecord, VerificationAttempt), so this one delete removes
 * everything held about the user — not four manually-sequenced deletes.
 *
 * Requires a `stepUpToken`, exactly like `reEnrollFace`/`reEnrollFingerprint`
 * (a follow-up review finding: deletion is at least as destructive as
 * re-enrollment — arguably more, since it's the one action with no recovery
 * path at all — yet it previously had no server-side gate beyond the
 * ordinary session check, relying entirely on `DeleteAccountConfirmation`'s
 * client-side type-DELETE-to-confirm text match. That's the exact kind of
 * client-only gate F11 already showed isn't a real boundary: anyone with a
 * valid session token — a stolen device, an unattended unlocked session —
 * could already reach this mutation and satisfy a text-match prompt
 * themselves). `assertStepUp` (`tokenService.ts`) is the same shared check
 * `reEnroll.ts` uses.
 *
 * Also revokes the caller's own current session token (F8) immediately
 * after deletion — without this, a session token issued before the delete
 * would remain structurally valid (and, since `RevokedToken` has no relation
 * to `User`, revoking it doesn't depend on the user row still existing) for
 * the rest of its natural life, even though the account it names no longer
 * exists.
 */
import { prisma } from '../../db/client';
import { assertStepUp, revokeToken } from '../../services/tokenService';
import { builder } from '../builder';
import { requireUserId } from '../context';

builder.mutationField('deleteMyAccount', (t) =>
  t.field({
    type: 'Boolean',
    args: {
      stepUpToken: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const userId = requireUserId(ctx);
      await assertStepUp(userId, args.stepUpToken);
      await prisma.user.delete({ where: { id: userId } });
      if (ctx.jti && ctx.exp) {
        await revokeToken(ctx.jti, new Date(ctx.exp * 1000));
      }
      return true;
    },
  }),
);
