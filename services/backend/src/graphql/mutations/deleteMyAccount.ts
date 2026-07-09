/**
 * `deleteMyAccount` — permanently deletes the authenticated user's row
 * (task 4.6, ADR-020). `onDelete: Cascade` is already configured in
 * schema.prisma on every child relation (BiometricEnrollment,
 * AttendanceRecord, VerificationAttempt), so this one delete removes
 * everything held about the user — not four manually-sequenced deletes.
 * Irreversible by design; the client-side confirmation UX (ProfileScreen)
 * is where the "no accidental destructive action" care actually lives —
 * this resolver has no further gate beyond the existing auth check, since
 * requiring a valid session token to even reach this mutation is already
 * the same bar every other authenticated mutation/query in this schema uses.
 */
import { prisma } from '../../db/client';
import { builder } from '../builder';
import { requireUserId } from '../context';

builder.mutationField('deleteMyAccount', (t) =>
  t.field({
    type: 'Boolean',
    resolve: async (_root, _args, ctx) => {
      const userId = requireUserId(ctx);
      await prisma.user.delete({ where: { id: userId } });
      return true;
    },
  }),
);
