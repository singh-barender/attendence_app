/**
 * A minimal DateTime scalar (ISO 8601 string over the wire) — hand-rolled
 * rather than pulling in graphql-scalars, since this is the only custom
 * scalar this schema needs so far (coding-standards.md's no-unnecessary-
 * dependency stance).
 */
import { builder } from '../builder';

export const DateTimeScalar = builder.scalarType('DateTime', {
  serialize: (value) => value.toISOString(),
  parseValue: (value) => {
    if (typeof value !== 'string') {
      throw new Error('DateTime must be an ISO 8601 string');
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error('DateTime must be a valid ISO 8601 string');
    }
    return date;
  },
});
