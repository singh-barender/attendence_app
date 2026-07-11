/**
 * Builds the Fastify app (routes + GraphQL schema registered) without
 * starting a listener — separated from index.ts so integration tests can
 * exercise the app via `app.inject()` (ADR-010) without binding a real port.
 */
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import mercurius from 'mercurius';
import { config } from './config';
import { buildContext } from './graphql/context';
import { schema } from './graphql/schema';
import { registerExportCsvRoute } from './routes/exportCsv.route';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: config.nodeEnv !== 'test' });

  // `origin: true` previously reflected back *any* request's Origin header
  // (task 4.13 follow-up) — a request with no Origin at all (every native
  // app fetch, and same-origin requests) is never subject to CORS in the
  // first place and is always allowed; only a *browser* request whose
  // Origin doesn't match this app's own known web origins is now rejected.
  await app.register(cors, {
    origin: (origin, callback) => {
      callback(null, !origin || config.corsAllowedOrigins.includes(origin));
    },
  });

  // Every GraphQL operation (`identify`, `registerStep1`, punch mutations,
  // everything else) shares this one `/graphql` route — Mercurius doesn't
  // expose a way to apply `@fastify/rate-limit`'s automatic per-route
  // wrapping to individual *operations* within a single endpoint, so rather
  // than a fragile hand-rolled per-operation-name check, this is one limit
  // applied to the whole endpoint. 30/min per IP is still generous for one
  // legitimate user's actual usage (a handful of identify/punch calls a
  // day) while meaningfully capping the two genuine abuse surfaces this
  // protects: `identify` (an intentionally unauthenticated lookup-by-email,
  // ADR-004 — unrestricted, it would let an attacker discover which emails
  // are registered by probing many) and the registration/punch mutations
  // (brute-force/abuse surface). In-memory store (the plugin's default) is
  // sufficient for this single-instance backend — no Redis/new infra, per
  // ADR-015. Skipped in the test environment — `app.test.ts`'s integration
  // suite legitimately fires dozens of requests in rapid succession against
  // one shared `app.inject()` instance, which isn't the "many real users, or
  // one attacker, hitting a live server" scenario this actually protects
  // against.
  if (config.nodeEnv !== 'test') {
    await app.register(rateLimit, { global: true, max: 30, timeWindow: '1 minute' });
  }

  await app.register(mercurius, {
    schema,
    context: buildContext,
    graphiql: config.nodeEnv !== 'production',
  });
  registerExportCsvRoute(app);

  return app;
}
