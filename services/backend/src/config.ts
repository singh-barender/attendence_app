/**
 * Single source of truth for backend configuration. Every env-derived value
 * is read and validated here once, at startup (fail fast on missing/invalid
 * values) — never a scattered ad-hoc `process.env.X` read elsewhere in the
 * codebase (coding-standards.md's no-hardcoded/unchannelized-values rule).
 */
import { MATCH_THRESHOLD } from '@attendance-app/face-matching';
import { FULL_DAY_HOURS } from '@attendance-app/shared-types';
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
  // Hours worked threshold for a "full day" (FULL_DAY vs PARTIAL_DAY status) —
  // same single-global-constant reasoning as SHIFT_START_HOUR above. Default
  // comes from shared-types since the mobile missed-checkout background task
  // needs the identical threshold client-side (missedCheckoutTask.native.ts).
  FULL_DAY_HOURS: z.coerce.number().positive().default(FULL_DAY_HOURS),
  // Cosine-similarity cutoff for the server's authoritative face re-match
  // (ADR-007). Exposed as config (not just the hard-coded packages/face-
  // matching default) precisely because that default is an untuned
  // placeholder: this is the single knob governing false-accept vs.
  // false-reject, and it must be tuned against real genuine/impostor score
  // distributions (the `VerificationAttempt.matchScore` audit trail already
  // records every score for exactly this calibration) — env-overridable so
  // that tuning needs no code change. Bounded to a valid cosine range.
  FACE_MATCH_THRESHOLD: z.coerce.number().min(-1).max(1).default(MATCH_THRESHOLD),
  // CORS allow-list (task 4.13 follow-up: `origin: true` previously
  // reflected back *any* request's Origin header). Only the web client is
  // ever subject to CORS at all — a native app's fetch never sends an
  // Origin header, so this only needs to cover this app's actual known web
  // origins: local `expo start --web` dev (Metro's unified dev server on
  // 8081 since Expo SDK ~49) and the Cloudflare Pages team-testing URL
  // (ADR-024), comma-separated so the latter can be set once deployed
  // without a code change.
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:8081,http://localhost:19006')
    .transform((value) => value.split(',').map((origin) => origin.trim())),
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
  fullDayHours: parsed.data.FULL_DAY_HOURS,
  faceMatchThreshold: parsed.data.FACE_MATCH_THRESHOLD,
  corsAllowedOrigins: parsed.data.CORS_ALLOWED_ORIGINS,
};
