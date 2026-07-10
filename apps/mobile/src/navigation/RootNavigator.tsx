/**
 * The app's one navigation stack (architecture.md) — Login is the initial
 * route. There is deliberately no "skip Login if a session already exists"
 * redirect: per requirements.md, biometric verification IS the punch event,
 * so returning to the app always re-verifies rather than silently reusing a
 * stored session token to bypass that (the stored token is only used to
 * authorize history/export requests within the same session, ADR-004).
 *
 * `screenOptions.contentStyle` is transparent (user-requested redesign) so
 * every screen sits on top of `GradientBackground` (mounted once around
 * this whole navigator in App.tsx) instead of native-stack's default
 * opaque per-screen surface painting over it. `headerShown: false` because
 * every screen already renders its own title via `ScreenContainer`'s H1 —
 * the native header would otherwise show a second, plain-white, unstyled
 * title bar stacked on top of that, clashing with the glass/gradient look.
 * Android's hardware/gesture back button still pops the stack normally
 * without a header back button; no screen relies on `headerLeft`.
 */
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AttendanceScreen } from '../screens/AttendanceScreen';
import { LoginPunchInScreen } from '../screens/LoginPunchInScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { ReEnrollFaceScreen } from '../screens/ReEnrollFaceScreen';
import { ReEnrollFingerprintScreen } from '../screens/ReEnrollFingerprintScreen';
import { Step1BasicInfoScreen } from '../screens/registration/Step1BasicInfoScreen';
import { Step2FingerprintScreen } from '../screens/registration/Step2FingerprintScreen';
import { Step3FaceEnrollScreen } from '../screens/registration/Step3FaceEnrollScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{ contentStyle: { backgroundColor: 'transparent' }, headerShown: false }}
      >
        <Stack.Screen
          name="Login"
          component={LoginPunchInScreen}
          options={{ title: 'Attendence App' }}
        />
        <Stack.Screen
          name="RegisterStep1"
          component={Step1BasicInfoScreen}
          options={{ title: 'Register — Basic Info' }}
        />
        <Stack.Screen
          name="RegisterStep2"
          component={Step2FingerprintScreen}
          options={{ title: 'Register — Fingerprint' }}
        />
        <Stack.Screen
          name="RegisterStep3"
          component={Step3FaceEnrollScreen}
          options={{ title: 'Register — Face Enrollment' }}
        />
        <Stack.Screen name="Attendance" component={AttendanceScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen
          name="ReEnrollFingerprint"
          component={ReEnrollFingerprintScreen}
          options={{ title: 'Re-enroll Fingerprint' }}
        />
        <Stack.Screen
          name="ReEnrollFace"
          component={ReEnrollFaceScreen}
          options={{ title: 'Re-enroll Face' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
