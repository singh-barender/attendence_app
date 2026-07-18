/**
 * registerStep1/2/3 — the 3-step registration wizard (requirements.md).
 * Each step advances `User.registrationStep`; step 2/3 delegate the actual
 * BiometricEnrollment writes to enrollmentService (ADR-005/ADR-006).
 *
 * `registerStep1` issues a session token immediately, the same way `login`
 * does (architecture-review-2026-07-16.md's F2b) — there's no principled
 * reason to make a user who just set a password wait until finishing the
 * whole wizard and then separately log in. This also closes a real
 * authorization gap: `registerStep2`/`registerStep3` used to take a bare
 * client-supplied `userId` (because no token existed yet at that point in
 * the flow), which meant anyone who learned another account's `userId`
 * could call them completely unauthenticated and overwrite that account's
 * fingerprint-confirmed flag or face embeddings. Both now resolve the
 * account from the session via `requireUserId`, the same choke point
 * `reEnrollFace`/`reEnrollFingerprint`/`deleteMyAccount` already use.
 */
import { prisma } from '../../db/client';
import type { User } from '../../generated/prisma/client';
import * as authService from '../../services/authService';
import * as enrollmentService from '../../services/enrollmentService';
import { issueSessionToken } from '../../services/tokenService';
import * as userService from '../../services/userService';
import { builder } from '../builder';
import { requireUserId } from '../context';
import { EmbeddingModelEnum } from '../types/enums';
import { UserRef } from '../types/User';

export const FaceEmbeddingsInput = builder.inputType('FaceEmbeddingsInput', {
  fields: (t) => ({
    left: t.floatList({ required: true }),
    right: t.floatList({ required: true }),
    frontal: t.floatList({ required: true }),
  }),
});

interface RegisterStep1ResultShape {
  token: string;
  user: User;
}

const RegisterStep1Result = builder
  .objectRef<RegisterStep1ResultShape>('RegisterStep1Result')
  .implement({
    fields: (t) => ({
      token: t.exposeString('token'),
      user: t.field({ type: UserRef, resolve: (result) => result.user }),
    }),
  });

builder.mutationType({
  fields: (t) => ({
    registerStep1: t.field({
      type: RegisterStep1Result,
      args: {
        fullName: t.arg.string({ required: true }),
        email: t.arg.string({ required: true }),
        password: t.arg.string({ required: true }),
        age: t.arg.int(),
        gender: t.arg.string(),
      },
      resolve: async (_root, args): Promise<RegisterStep1ResultShape> => {
        userService.assertValidEmail(args.email);
        userService.assertValidAge(args.age);
        await userService.assertEmailNotRegistered(args.email);
        // Hash (and validate length) before create — the plaintext never
        // touches the row (ADR-030).
        const passwordHash = await authService.hashPassword(args.password);

        const user = await prisma.user.create({
          data: {
            fullName: args.fullName,
            email: args.email,
            passwordHash,
            age: args.age ?? null,
            gender: args.gender ?? null,
            registrationStep: 1,
          },
        });
        const token = await issueSessionToken(user.id);
        return { token, user };
      },
    }),
    registerStep2: t.prismaField({
      type: 'User',
      args: {
        fingerprintConfirmed: t.arg.boolean({ required: true }),
      },
      resolve: async (query, _root, args, ctx) => {
        const userId = requireUserId(ctx);
        await userService.assertRegistrationNotComplete(userId);
        if (args.fingerprintConfirmed) {
          await enrollmentService.recordFingerprintConfirmation(userId);
        }

        return prisma.user.update({
          ...query,
          where: { id: userId },
          data: { registrationStep: 2 },
        });
      },
    }),
    registerStep3: t.prismaField({
      type: 'User',
      args: {
        embeddings: t.arg({ type: FaceEmbeddingsInput, required: true }),
        embeddingModel: t.arg({ type: EmbeddingModelEnum, required: true }),
      },
      resolve: async (query, _root, args, ctx) => {
        const userId = requireUserId(ctx);
        await userService.assertRegistrationNotComplete(userId);
        await enrollmentService.recordFaceEnrollment(userId, args.embeddings, args.embeddingModel);

        return prisma.user.update({
          ...query,
          where: { id: userId },
          data: { registrationStep: 3 },
        });
      },
    }),
  }),
});
