/**
 * Points the test run at an isolated SQLite file (not dev.db) so integration
 * tests can freely create/delete data without touching anything a developer
 * is manually testing against in the same working copy.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: 'file:./test.db',
      NODE_ENV: 'test',
    },
  },
});
