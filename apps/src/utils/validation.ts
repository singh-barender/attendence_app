/**
 * Client-side pre-checks only, for immediate form feedback — the server
 * (backend/src/services/userService.ts) is the authoritative
 * validator on every one of these rules, same philosophy as ADR-007's
 * "client is optimistic, server decides."
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}
