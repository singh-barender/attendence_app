/**
 * `myVerificationAttempts` — the authenticated user's own verification
 * history, success and failure alike (task 4.4, ADR-019: this is
 * user-visible account activity, not just silent backend logging). No
 * `take` limit, matching `getAllAttendanceRecords`'s existing precedent for
 * a flat per-event list (attendanceReportingService.ts) — this app has no
 * pagination anywhere yet, and per-user attempt volume is POC-scale.
 */
import { prisma } from '../../db/client';
import { builder } from '../builder';
import { requireUserId } from '../context';

builder.queryField('myVerificationAttempts', (t) =>
  t.prismaField({
    type: ['VerificationAttempt'],
    resolve: async (query, _root, _args, ctx) => {
      const userId = requireUserId(ctx);
      return prisma.verificationAttempt.findMany({
        ...query,
        where: { userId },
        orderBy: { timestamp: 'desc' },
      });
    },
  }),
);
