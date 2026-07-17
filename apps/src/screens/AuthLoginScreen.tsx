/**
 * Email + password login (ADR-030) — the app's entry screen. This is the only
 * place a password is entered; on success it stores the session token and
 * lands on the dashboard, from which the user checks in/out on demand (a real
 * biometric each time, on the Punch screen). Reaching the app with a token
 * already stored skips straight to the dashboard (session persistence) — the
 * password only gates *establishing* a session, not viewing within one.
 *
 * Routes by `registrationStep` (not blindly to the dashboard) — registerStep1
 * now issues a session token immediately (architecture-review-2026-07-16
 * .md's F2b), so an account that dropped off mid-wizard already has a valid,
 * persisted session; without this check, reopening the app (or logging in
 * manually from a different device) would land squarely on the dashboard
 * despite registration never having finished.
 */
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, H1, Spinner, Text, YStack } from 'tamagui';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { GlassCard } from '../components/GlassCard';
import { IconInput } from '../components/IconInput';
import { PasswordInput } from '../components/PasswordInput';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { useLoginMutation, useMeQuery } from '../generated/graphql';
import type { RootScreenProps } from '../navigation/types';
import { setAuthToken } from '../services/graphqlClient';
import { getErrorMessage } from '../services/graphqlError';
import { loadToken, saveToken } from '../services/tokenStorage';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { isValidEmail } from '../utils/validation';

export function AuthLoginScreen({ navigation, route }: RootScreenProps<'Login'>) {
  const insets = useSafeAreaInsets();
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [hasStoredToken, setHasStoredToken] = useState(false);

  function routeAfterAuth(
    registrationStep: number | null | undefined,
    userId: string,
    email: string,
  ) {
    if (registrationStep === 1) {
      navigation.replace('RegisterStep2', { userId, email });
    } else if (registrationStep === 2) {
      navigation.replace('RegisterStep3', { userId, email });
    } else {
      navigation.replace('Attendance');
    }
  }

  // Session persistence: a stored token means an existing session — go
  // straight to wherever that account actually is (dashboard, or back into
  // an unfinished wizard) rather than asking for the password again.
  useEffect(() => {
    loadToken().then((token) => {
      if (token) {
        setAuthToken(token);
        setHasStoredToken(true);
      }
    });
  }, []);

  // Only fetches once a stored token exists — an invalid/expired token
  // simply leaves `me` failed and the screen falls through to its normal
  // manual-login state.
  const { data: meData, isFetched: isMeFetched } = useMeQuery(undefined, {
    enabled: hasStoredToken,
  });

  // routeAfterAuth is redefined every render (not memoized) but only closes
  // over `navigation`, which is stable — depending on it would just force
  // redundant re-runs without changing behavior.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    if (!hasStoredToken || !isMeFetched) {
      return;
    }
    const me = meData?.me;
    if (!me?.id || !me.email) {
      return;
    }
    routeAfterAuth(me.registrationStep, me.id, me.email);
  }, [hasStoredToken, isMeFetched, meData]);

  const { mutate, isPending } = useLoginMutation({
    onSuccess: async (data) => {
      const token = data.login?.token;
      const user = data.login?.user;
      if (!token || !user?.id || !user.email) {
        setFormError('Something went wrong signing you in. Please try again.');
        return;
      }
      await saveToken(token);
      setAuthToken(token);
      routeAfterAuth(user.registrationStep, user.id, user.email);
    },
    onError: (error) => setFormError(getErrorMessage(error, 'Invalid email or password.')),
  });

  function handleLogin() {
    if (!isValidEmail(email)) {
      setFormError('Enter a valid email address.');
      return;
    }
    if (password.length === 0) {
      setFormError('Enter your password.');
      return;
    }
    setFormError(null);
    mutate({ email: email.trim(), password });
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <YStack
        flex={1}
        style={{ justifyContent: 'center', alignItems: 'center' }}
        px="$2"
        py="$4"
        pb={insets.bottom + 16}
      >
        <YStack width="100%" style={{ maxWidth: 440 }}>
          <GlassCard p="$6" gap="$4">
            <H1 style={{ textAlign: 'center', color: palette.ink }} mb="$2">
              Attendance App
            </H1>
            <Text style={{ textAlign: 'center', color: palette.inkSoft }} mb="$2">
              Sign in with your email and password. Check-in and check-out happen from your
              dashboard, verified by your face or fingerprint.
            </Text>

            <IconInput
              icon="mail-outline"
              size="$4"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setFormError(null);
              }}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              returnKeyType="next"
            />
            <PasswordInput
              size="$4"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                setFormError(null);
              }}
              placeholder="Your password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleLogin}
            />

            {formError ? <FeedbackBanner variant="error" message={formError} /> : null}

            <Button
              size="$4"
              onPress={handleLogin}
              disabled={isPending}
              style={{ backgroundColor: palette.accent }}
              {...(isPending ? { icon: <Spinner /> } : {})}
            >
              <Text style={{ color: palette.accentInk, fontWeight: '700', letterSpacing: 1 }}>
                {isPending ? 'SIGNING IN...' : 'SIGN IN'}
              </Text>
            </Button>

            <Button
              variant="outlined"
              size="$4"
              onPress={() => navigation.navigate('RegisterStep1', { email: email.trim() })}
            >
              <Text style={{ color: palette.ink, letterSpacing: 1 }}>CREATE AN ACCOUNT</Text>
            </Button>
          </GlassCard>
        </YStack>
      </YStack>
    </ScrollView>
  );
}
