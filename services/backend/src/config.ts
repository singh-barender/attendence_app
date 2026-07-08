/**
 * Single source of truth for backend configuration. Every env-derived value
 * is read and validated here once, at startup (fail fast on missing/invalid
 * values) — never a scattered ad-hoc `process.env.X` read elsewhere in the
 * codebase (coding-standards.md's no-hardcoded/unchannelized-values rule).
 */
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JWT_SECRET: z.string().min(32),
  // "Late" status derivation (ADR-016) — a single global shift-start hour,
  // since there's no per-user/per-org schedule (no multi-tenant support,
  // per requirements.md's explicit non-goals).
  SHIFT_START_HOUR: z.coerce.number().int().min(0).max(23).default(9),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const config = {
  databaseUrl: parsed.data.DATABASE_URL,
  port: parsed.data.PORT,
  nodeEnv: parsed.data.NODE_ENV,
  jwtSecret: parsed.data.JWT_SECRET,
  shiftStartHour: parsed.data.SHIFT_START_HOUR,
};
