/**
 * Business-rule validation for user registration — pure logic, no GraphQL/
 * Pothos awareness, so it's testable in isolation and reusable if another
 * entry point ever needs the same rules (ADR-011's zod-for-business-rules
 * stance).
 */
import { MAX_REGISTRATION_AGE, MIN_REGISTRATION_AGE } from '@attendance-app/shared-types';
import { z } from 'zod';
import { prisma } from '../db/client';

const emailSchema = z.string().email();
const ageSchema = z.number().int().min(MIN_REGISTRATION_AGE).max(MAX_REGISTRATION_AGE);

export function assertValidEmail(email: string): void {
  if (!emailSchema.safeParse(email).success) {
    throw new Error('Invalid email address');
  }
}

export function assertValidAge(age: number | null | undefined): void {
  if (age == null) {
    return;
  }
  if (!ageSchema.safeParse(age).success) {
    throw new Error(`Age must be between ${MIN_REGISTRATION_AGE} and ${MAX_REGISTRATION_AGE}`);
  }
}

export async function assertEmailNotRegistered(email: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Deliberately the same message regardless of whether that account
    // finished registering (registrationStep 3) or dropped off mid-wizard —
    // distinguishing the two here would leak account-completion state to
    // whoever tried the email. Either way, the correct next step is the
    // same: log in. A dropped-off registration resumes automatically from
    // there (requirements.md's "Registration is resumable/idempotent per
    // step" — AuthLoginScreen routes by `registrationStep`); registerStep1
    // itself is a one-time `create` with no update path, so telling the
    // caller to retry registration would just fail again.
    throw new Error('An account with this email already exists — log in instead.');
  }
}

/**
 * Blocks `registerStep2`/`registerStep3` from being called again once the
 * wizard has already finished (`registrationStep === 3`) — a Round 6 review
 * finding: both steps resolve the account from the session token alone
 * (no step-up), so without this guard a still-valid session token (e.g.
 * leaked, or a device left unlocked) could silently append a brand-new
 * fingerprint confirmation or a brand-new set of face embeddings to an
 * already-fully-registered account — the exact biometric replacement
 * `reEnrollFingerprint`/`reEnrollFace` deliberately gate behind step-up
 * re-authentication (ADR-030), bypassed entirely via this back door. Steps
 * 1-2 of the wizard stay freely (re-)callable so a genuinely resumed/retried
 * registration is unaffected.
 */
export async function assertRegistrationNotComplete(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user && user.registrationStep >= 3) {
    throw new Error(
      'Registration is already complete for this account — use re-enrollment from your profile to update biometrics instead.',
    );
  }
}
