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
    throw new Error('An account with this email already exists');
  }
}
