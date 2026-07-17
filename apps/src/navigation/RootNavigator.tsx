/**
 * The app's one navigation stack (architecture.md) — `Login` (now
 * `AuthLoginScreen`, ADR-030's email+password screen) is the initial route,
 * but it isn't a forced re-entry point: it redirects straight to the
 * dashboard on mount if a valid session token is already stored, since the
 * password only gates *establishing* a session, not viewing within one. The
 * `Punch` route (`LoginPunchInScreen`) is where a real biometric
 * verification actually happens, reached only from the dashboard on demand
 * — see `AuthLoginScreen`'s and `LoginPunchInScreen`'s own doc comments.
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
import { AuthLoginScreen } from '../screens/AuthLoginScreen';
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
        <Stack.Screen name="Login" component={AuthLoginScreen} options={{ title: 'Sign In' }} />
        <Stack.Screen name="Punch" component={LoginPunchInScreen} options={{ title: 'Verify' }} />
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
