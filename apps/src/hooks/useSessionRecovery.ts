/**
 * Session-aware account recovery + routing for the Punch screen, split out
 * of `LoginPunchInScreen` (coding-standards.md's "small, modular,
 * single-responsibility files") — recovers which account is punching from
 * the saved session token (never typed here, ADR-030), and redirects a cold
 * reopen with a still-open session straight to the dashboard rather than
 * forcing the checkout-verify view (user-requested "reopen isn't forceful").
 *
 * This screen is only ever reached authenticated (from the dashboard), so
 * the account is fully identified by the one `me` query alone — there used
 * to be a second, separate `identify(email)` round-trip after `me` settled
 * (a leftover from the pre-ADR-030 hand-typed-email flow, where `identify`
 * was the only way to look up enrollment status before any session
 * existed). Removed (architecture-review-2026-07-16.md's F9): it was pure
 * redundant latency here, and `identify` is a public, unauthenticated query
 * (F2a) — every avoidable call to it is worth avoiding, not just for speed.
 * `identify`-shaped data is now derived directly from `meData.me` below.
 */
import { useEffect, useRef, useState } from 'react';
import { useAttendanceHistoryQuery, useMeQuery } from '../generated/graphql';
import type { RootScreenProps } from '../navigation/types';
import { setAuthToken } from '../services/graphqlClient';
import { loadToken } from '../services/tokenStorage';

export function useSessionRecovery(
  navigation: RootScreenProps<'Punch'>['navigation'],
  isExplicitCheckout: boolean,
) {
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  /** Session-aware routing (user-requested): `null` while still checking
   * storage, then whether a session token was found. Gates the auto-login
   * bootstrap below — set directly from `loadToken()` here rather than
   * relying on App.tsx's own startup `loadToken`/`setAuthToken` call having
   * already finished (no ordering guarantee between the two), calling
   * `setAuthToken` again here too so the header is set regardless of which
   * effect actually wins the race. */
  const [hasStoredToken, setHasStoredToken] = useState<boolean | null>(null);

  /** True once the account was recovered from the saved token (a cold
   * app-reopen), as opposed to the user typing an email by hand. Only this
   * path redirects an open session to the dashboard (part of the
   * "reopen lands on the dashboard, not forced checkout" ask) — a
   * hand-typed email that happens to have an open session still shows the
   * verify view here. */
  const [didAutoRecover, setDidAutoRecover] = useState(false);

  useEffect(() => {
    loadToken().then((token) => {
      if (token) {
        setAuthToken(token);
      }
      setHasStoredToken(Boolean(token));
    });
  }, []);

  /** Auto-login (user-requested "remember my session" ask, ADR-004-safe:
   * this only recovers *which account* to identify, skipping the manual
   * email-entry step — it never skips the actual biometric re-verification
   * a punch still requires). `hasAttemptedAutoLoginRef` makes this strictly
   * one-shot per mount: without it, tapping "use a different email" would
   * reset `submittedEmail` to null, which would just re-enable this query
   * and immediately re-submit the same remembered email, making "use a
   * different email" impossible to actually act on. A failed/unauthorized
   * `me` (expired or cleared token) just leaves the screen on its normal
   * manual-entry state. */
  const hasAttemptedAutoLoginRef = useRef(false);
  const { data: meData, isFetched: isMeFetched } = useMeQuery(undefined, {
    enabled: hasStoredToken === true,
  });

  // submittedEmail is intentionally excluded: this must only react to the
  // `me` fetch settling, never re-run just because submittedEmail changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    if (!isMeFetched || hasAttemptedAutoLoginRef.current) {
      return;
    }
    hasAttemptedAutoLoginRef.current = true;
    if (meData?.me?.email && submittedEmail === null) {
      setDidAutoRecover(true);
      setSubmittedEmail(meData.me.email);
    }
  }, [isMeFetched, meData]);

  /** `identify`-shaped view of `meData.me`, so the rest of this hook and its
   * consumers (`PunchVerificationPanel`) don't need to know this used to be
   * a separate query — same field names `identify` always had, just sourced
   * from the authenticated `me` result instead of a second round-trip. */
  const identify = meData?.me
    ? {
        userId: meData.me.id,
        faceEnrolled: meData.me.enrollmentStatus?.faceEnrolled ?? null,
        fingerprintEnrolled: meData.me.enrollmentStatus?.fingerprintEnrolled ?? null,
        registrationStep: meData.me.registrationStep,
      }
    : undefined;

  /** Today's open (checked-in, not checked-out) session, if any — drives
   * the live `SessionTimer` and disabling "use a different email" below.
   * Searching for `status === 'OPEN'` rather than computing "today" on the
   * client is deliberate: only the actual server-side today's row can ever
   * be OPEN (part B), so this needs no separate date computation that could
   * drift from the server's own notion of "today". */
  const { data: attendanceHistoryData, isFetched: isHistoryFetched } = useAttendanceHistoryQuery(
    undefined,
    { enabled: Boolean(identify) },
  );
  const openSessionDay = attendanceHistoryData?.attendanceHistory?.find(
    (day) => day.status === 'OPEN',
  );

  /** On a cold app-reopen with a still-open session, send the user to the
   * dashboard (which shows the live timer and a "Verify to check out"
   * button) rather than dropping them straight onto the checkout verify view
   * — the user found the latter "forcefully" gating the dashboard behind a
   * checkout. Redirects exactly once, and never when the screen was opened
   * *for* checkout (`isExplicitCheckout`) or when the email was typed by hand
   * (`didAutoRecover` is false), both of which legitimately want the verify
   * view here. `replace` (not `navigate`) so back doesn't return to this
   * transient login screen. */
  const hasRedirectedToDashboardRef = useRef(false);
  useEffect(() => {
    if (isExplicitCheckout || !didAutoRecover || hasRedirectedToDashboardRef.current) {
      return;
    }
    if (openSessionDay) {
      hasRedirectedToDashboardRef.current = true;
      navigation.replace('Attendance');
    }
  }, [isExplicitCheckout, didAutoRecover, openSessionDay, navigation]);

  /** While an auto-recovered session is still resolving whether today is
   * open, hold back the verify view: if it turns out open we're about to
   * redirect to the dashboard, and flashing the checkout verify view for
   * that split second would reproduce the exact "forced straight to
   * checkout" behavior this routing removes. Doesn't apply to explicit
   * checkout or hand-typed check-in, which both want the verify view. */
  const isResolvingReopenedSession =
    didAutoRecover && !isExplicitCheckout && Boolean(identify) && !isHistoryFetched;

  /** Registration isn't done until Step 3 (`registrationStep === 3`) — an
   * account mid-wizard shouldn't be offered "Verify Face"/"Verify
   * Fingerprint" alongside "Continue Registration" at the same time (a
   * confusing multi-button state); only one CTA makes sense at once. */
  const isRegistrationComplete = (identify?.registrationStep ?? 3) >= 3;

  return {
    submittedEmail,
    // Sourced from the authenticated `me` query, not the public `identify`
    // query (architecture-review-2026-07-16.md's F2a/F9) — `identify` no
    // longer exposes a name at all, since it's reachable by anyone who
    // knows an email, and a stranger's real name has no business being
    // handed back there.
    accountFullName: meData?.me?.fullName ?? null,
    identify,
    openSessionDay,
    isResolvingReopenedSession,
    isRegistrationComplete,
  };
}
