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
  Login: undefined;
  RegisterStep1: undefined;
  RegisterStep2: { userId: string };
  RegisterStep3: { userId: string };
  Attendance: undefined;
  Profile: undefined;
};

export type RootScreenProps<RouteName extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  RouteName
>;
