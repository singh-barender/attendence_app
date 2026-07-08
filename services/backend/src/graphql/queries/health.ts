/**
 * Health-check query — also doubles as the minimal real query needed to
 * produce a valid GraphQL schema (Pothos requires at least one Query field)
 * while the actual business queries/mutations are built out task by task.
 */
import { builder } from '../builder';

builder.queryType({
  fields: (t) => ({
    health: t.string({
      resolve: () => 'ok',
    }),
  }),
});
