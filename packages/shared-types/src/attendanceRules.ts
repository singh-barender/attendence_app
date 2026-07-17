/**
 * Hours-worked threshold for a "full day" — `backend`'s `config.ts`
 * is the authoritative, env-overridable value (`FULL_DAY_HOURS`), defaulting
 * to this same number; the mobile client's missed-checkout background task
 * (`missedCheckoutTask.native.ts`) needs its own copy of this threshold
 * client-side (to compute "has it been this long since check-in" without a
 * network round trip's worth of derived logic), so both start from one
 * shared default rather than two independently-chosen numbers that could
 * drift apart. Same pattern as `registrationRules.ts`.
 */
export const FULL_DAY_HOURS = 8;
