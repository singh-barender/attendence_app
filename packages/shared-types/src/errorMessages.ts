/**
 * Error message shared across the client/server boundary — the backend
 * (userService.ts's `findUserByEmail`, used by the `identify` query) is the
 * authoritative thrower; the mobile client (LoginPunchInScreen.tsx) matches
 * on this exact string to decide whether to offer a "Register" CTA, so a
 * single source keeps the two from drifting (same pattern as
 * registrationRules.ts).
 */
export const ACCOUNT_NOT_FOUND_MESSAGE = 'No account found for this email';
