/**
 * registerStep1/2/3 — the 3-step registration wizard (requirements.md).
 * Each step advances `User.registrationStep`; step 2/3 delegate the actual
 * BiometricEnrollment writes to enrollmentService (ADR-005/ADR-006).
 */
import { prisma } from '../../db/client';
import * as enrollmentService from '../../services/enrollmentService';
import * as userService from '../../services/userService';
import { builder } from '../builder';

export const FaceEmbeddingsInput = builder.inputType('FaceEmbeddingsInput', {
  fields: (t) => ({
    left: t.floatList({ required: true }),
    right: t.floatList({ required: true }),
    frontal: t.floatList({ required: true }),
  }),
});

builder.mutationType({
  fields: (t) => ({
    registerStep1: t.prismaField({
      type: 'User',
      args: {
        fullName: t.arg.string({ required: true }),
        email: t.arg.string({ required: true }),
        age: t.arg.int(),
        gender: t.arg.string(),
        location: t.arg.string(),
      },
      resolve: async (query, _root, args) => {
        userService.assertValidEmail(args.email);
        userService.assertValidAge(args.age);
        await userService.assertEmailNotRegistered(args.email);

        return prisma.user.create({
          ...query,
          data: {
            fullName: args.fullName,
            email: args.email,
            age: args.age ?? null,
            gender: args.gender ?? null,
            location: args.location ?? null,
            registrationStep: 1,
          },
        });
      },
    }),
    registerStep2: t.prismaField({
      type: 'User',
      args: {
        userId: t.arg.id({ required: true }),
        fingerprintConfirmed: t.arg.boolean({ required: true }),
      },
      resolve: async (query, _root, args) => {
        const userId = String(args.userId);
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
        userId: t.arg.id({ required: true }),
        embeddings: t.arg({ type: FaceEmbeddingsInput, required: true }),
      },
      resolve: async (query, _root, args) => {
        const userId = String(args.userId);
        await enrollmentService.recordFaceEnrollment(userId, args.embeddings);

        return prisma.user.update({
          ...query,
          where: { id: userId },
          data: { registrationStep: 3 },
        });
      },
    }),
  }),
});
