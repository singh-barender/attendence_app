/**
 * Builds the Fastify app (routes + GraphQL schema registered) without
 * starting a listener — separated from index.ts so integration tests can
 * exercise the app via `app.inject()` (ADR-010) without binding a real port.
 */
import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import mercurius from 'mercurius';
import { config } from './config';
import { buildContext } from './graphql/context';
import { schema } from './graphql/schema';
import { registerExportCsvRoute } from './routes/exportCsv.route';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: config.nodeEnv !== 'test' });

  await app.register(cors, { origin: true });
  await app.register(mercurius, {
    schema,
    context: buildContext,
    graphiql: config.nodeEnv !== 'production',
  });
  registerExportCsvRoute(app);

  return app;
}
