/**
 * `confirmStepUp` — re-verifies the caller's own password and issues a
 * short-lived step-up token proving that just happened (architecture-review
 * -2026-07-16.md's F11). Required by `reEnrollFace`/`reEnrollFingerprint`
 * (`reEnroll.ts`) so a merely-valid session token (which can be days old,
 * or leftover on an unattended/stolen device) isn't sufficient on its own to
 * replace an account's biometric enrollment — the caller must prove they
 * still know the password *right now*.
 *
 * Requires an existing session (`requireUserId`) — this step-up gate isn't
 * a second login, it's a fresh-proof check layered on top of one.
 */
import { prisma } from '../../db/client';
import * as authService from '../../services/authService';
import { issueStepUpToken } from '../../services/tokenService';
import { builder } from '../builder';
import { requireUserId } from '../context';

const INVALID_PASSWORD = 'That password is incorrect.';

interface StepUpResultShape {
  stepUpToken: string;
}

const StepUpResult = builder.objectRef<StepUpResultShape>('StepUpResult').implement({
  fields: (t) => ({
    stepUpToken: t.exposeString('stepUpToken'),
  }),
});

builder.mutationField('confirmStepUp', (t) =>
  t.field({
    type: StepUpResult,
    args: {
      password: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx): Promise<StepUpResultShape> => {
      const userId = requireUserId(ctx);
      const user = await prisma.user.findUnique({ where: { id: userId } });
      // No enumeration concern here (unlike login.ts) — userId already came
      // from a verified session token, not a public email lookup.
      const passwordValid = await authService.verifyPassword(
        args.password,
        user?.passwordHash ?? null,
      );
      if (!passwordValid) {
        throw new Error(INVALID_PASSWORD);
      }

      const stepUpToken = await issueStepUpToken(userId);
      return { stepUpToken };
    },
  }),
);
