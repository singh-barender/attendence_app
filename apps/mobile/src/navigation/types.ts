/**
 * Single source of truth for the navigation graph's param types — every
 * screen's props are derived from this, not hand-duplicated per screen.
 * There's no "already logged in, skip Login" redirect to add here: since
 * verification *is* the punch event (task 1.18, requirements.md), visiting
 * Login and re-verifying is the deliberate, repeated action every time —
 * the persisted session token (`tokenStorage.native.ts`) only authenticates
 * *read* queries (attendance history, export), it never bypasses punching.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  /** Email + password sign-in (ADR-030). `email` pre-fills the field after
   * registration hands off here. */
  Login: { email?: string } | undefined;
  /** The biometric check-in/out screen, reached from the dashboard once
   * signed in. `intent` selects the wording/action; the punch itself is a
   * real face/fingerprint verification (ADR-004/ADR-007) requiring the
   * authenticated session (ADR-030). */
  Punch: { intent: 'checkin' | 'checkout' };
  /** `email` pre-fills the first registration field when the user reached
   * here from Login's "account not found" path, so the email they just
   * typed to look themselves up isn't thrown away and retyped. Optional —
   * registration is also reachable cold (no param) as its own entry point. */
  RegisterStep1: { email?: string } | undefined;
  /** `email` is carried through the registration wizard purely so the final
   * step can hand it to the check-in screen (a freshly-registered account
   * shouldn't have to retype the email it just registered with). */
  RegisterStep2: { userId: string; email: string };
  RegisterStep3: { userId: string; email: string };
  Attendance: undefined;
  Profile: undefined;
  ReEnrollFingerprint: undefined;
  ReEnrollFace: undefined;
};

export type RootScreenProps<RouteName extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  RouteName
>;
