/**
 * Password rules for account access (ADR-030) — the backend (authService.ts)
 * is the authoritative validator; the mobile client (Step1BasicInfoScreen /
 * the login screen) imports the same constant for immediate client-side
 * feedback, per ADR-007's "client is optimistic, server decides" stance. A
 * single source keeps the two from drifting.
 */
export const MIN_PASSWORD_LENGTH = 8;
