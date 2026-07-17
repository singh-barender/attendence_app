/**
 * `me` — the authenticated user's own profile + enrollment status (task
 * 4.1), the single data source ProfileScreen reads from. Unlike `identify`
 * (a pre-login email lookup), this resolves the id straight off the
 * verified session token via `requireUserId`, the same auth choke point
 * `attendanceHistory` uses.
 */
import { prisma } from '../../db/client';
import { builder } from '../builder';
import { requireUserId } from '../context';

builder.queryField('me', (t) =>
  t.prismaField({
    type: 'User',
    resolve: async (query, _root, _args, ctx) => {
      const userId = requireUserId(ctx);
      return prisma.user.findUniqueOrThrow({ ...query, where: { id: userId } });
    },
  }),
);
