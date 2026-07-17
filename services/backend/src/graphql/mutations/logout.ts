/**
 * `logout` — revokes the caller's own current session token server-side
 * (architecture-review-2026-07-16.md's F8). Before this existed, "log out"
 * only ever cleared client-side storage; a captured or leftover token
 * (stolen device, XSS reading web `localStorage`) remained fully valid for
 * its entire 7-day life regardless of what the client believed its own
 * state was. Requires an authenticated session (there is nothing to revoke
 * otherwise) and only ever revokes the token making *this* request — never
 * takes a token argument, so it can't be used to revoke someone else's.
 */

import { revokeToken } from '../../services/tokenService';
import { builder } from '../builder';
import { requireUserId } from '../context';

builder.mutationField('logout', (t) =>
  t.field({
    type: 'Boolean',
    resolve: async (_root, _args, ctx) => {
      requireUserId(ctx);
      if (ctx.jti && ctx.exp) {
        await revokeToken(ctx.jti, new Date(ctx.exp * 1000));
      }
      return true;
    },
  }),
);
