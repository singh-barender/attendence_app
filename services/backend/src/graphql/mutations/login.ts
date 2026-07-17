/**
 * login — email + password → a session token (ADR-030). The single place a
 * password is verified. Returns a **generic** "invalid email or password"
 * whether the email is unknown or the password is wrong, so it can't be used
 * to enumerate which emails are registered (the same anti-enumeration stance
 * `identify` takes, and it's rate-limited at the route level like `identify`).
 *
 * The generic error message alone isn't sufficient for that anti-enumeration
 * goal — a response-time difference can leak the same information a
 * different way (architecture-review-2026-07-16.md's F5). `verifyPassword`
 * is always called, even for an unknown email (passing `null`), so bcrypt's
 * cost is paid on both paths; short-circuiting to `false` before ever
 * calling it (this file's previous version) would skip that cost for an
 * unknown email specifically, making the two cases distinguishable by
 * timing despite the identical error text.
 *
 * This establishes the authenticated session the dashboard and the punch
 * mutations require — the biometric punch itself is unchanged and still the
 * attendance event / security boundary (ADR-004/ADR-007).
 */
import { prisma } from '../../db/client';
import type { User } from '../../generated/prisma/client';
import * as authService from '../../services/authService';
import { issueSessionToken } from '../../services/tokenService';
import { builder } from '../builder';
import { UserRef } from '../types/User';

interface LoginResultShape {
  token: string;
  user: User;
}

const INVALID_CREDENTIALS = 'Invalid email or password.';

const LoginResult = builder.objectRef<LoginResultShape>('LoginResult').implement({
  fields: (t) => ({
    token: t.exposeString('token'),
    user: t.field({ type: UserRef, resolve: (result) => result.user }),
  }),
});

builder.mutationField('login', (t) =>
  t.field({
    type: LoginResult,
    args: {
      email: t.arg.string({ required: true }),
      password: t.arg.string({ required: true }),
    },
    resolve: async (_root, args): Promise<LoginResultShape> => {
      const user = await prisma.user.findUnique({ where: { email: args.email.trim() } });
      // Always calls verifyPassword — even for an unknown email (null hash)
      // — so both cases pay the same bcrypt cost (see this file's header
      // comment, F5).
      const passwordValid = await authService.verifyPassword(
        args.password,
        user?.passwordHash ?? null,
      );
      if (!user || !passwordValid) {
        throw new Error(INVALID_CREDENTIALS);
      }

      const token = await issueSessionToken(user.id);
      return { token, user };
    },
  }),
);
