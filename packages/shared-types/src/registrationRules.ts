/**
 * Age bounds for registration — the backend (userService.ts) is the
 * authoritative validator; the mobile client (Step1BasicInfoScreen.tsx)
 * imports the same constants for immediate client-side feedback, per
 * ADR-007's "client is optimistic, server decides" stance applied to
 * ordinary form validation too. A single source avoids the two ever drifting.
 */
export const MIN_REGISTRATION_AGE = 16;
export const MAX_REGISTRATION_AGE = 100;
