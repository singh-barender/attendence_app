/**
 * Shared plain-language mapping for `expo-local-authentication`'s error
 * codes — used by both registration Step2 and the login/punch-in
 * fingerprint path so the two screens don't hand-roll two copies.
 */
import type { LocalAuthenticationError } from 'expo-local-authentication';

const MESSAGES: Partial<Record<LocalAuthenticationError, string>> = {
  user_cancel: 'Cancelled — try again.',
  lockout: 'Too many attempts. Wait a moment and try again.',
  not_enrolled: 'No fingerprint enrolled on this device.',
  not_available: 'Biometric hardware is unavailable right now.',
};

export function getFingerprintAuthErrorMessage(error: LocalAuthenticationError): string {
  return MESSAGES[error] ?? `Authentication failed (${error}).`;
}
