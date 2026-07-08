/**
 * The login/punch-in flow (requirements.md) — these are the same action,
 * not two separate steps. Email identifies the account (no password, ever);
 * whichever biometric method succeeds *is* the login *and* the punch event.
 * Only the fingerprint path is real here — face verification is Phase 2
 * (ADR-006), so `faceEnrolled` accounts just see an informational message
 * for now, not a broken "Face" button.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, H1, Input, Spinner, Text, YStack } from 'tamagui';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { useIdentifyQuery, usePunchInFingerprintMutation } from '../generated/graphql';
import { useFingerprintHardwareStatus } from '../hooks/useFingerprintHardwareStatus';
import type { RootScreenProps } from '../navigation/types';
import { setAuthToken } from '../services/graphqlClient';
import { getErrorMessage } from '../services/graphqlError';
import { saveToken } from '../services/tokenStorage.native';
import { getFingerprintAuthErrorMessage } from '../utils/fingerprintAuthErrors';
import { getBestEffortLocation } from '../utils/geolocation';
import { isValidEmail } from '../utils/validation';

export function LoginPunchInScreen({ navigation }: RootScreenProps<'Login'>) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const { status: hardwareStatus } = useFingerprintHardwareStatus();

  const {
    data: identifyData,
    isLoading: isIdentifying,
    isError: isIdentifyError,
    error: identifyError,
  } = useIdentifyQuery({ email: submittedEmail ?? '' }, { enabled: submittedEmail !== null });

  const {
    mutate: punchIn,
    isPending: isPunchingIn,
    isError: isPunchError,
    error: punchError,
  } = usePunchInFingerprintMutation({
    onSuccess: async (data) => {
      const token = data.punchInFingerprint?.token;
      if (token) {
        await saveToken(token);
        setAuthToken(token);
      }
      navigation.navigate('Attendance');
    },
  });

  function handleContinue() {
    if (!isValidEmail(email)) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailError(null);
    setSubmittedEmail(email.trim());
  }

  function handleUseDifferentEmail() {
    setSubmittedEmail(null);
    setAuthError(null);
  }

  async function handleVerify() {
    const identify = identifyData?.identify;
    if (!identify?.userId) {
      return;
    }
    setAuthError(null);
    setIsVerifying(true);
    try {
      const location = await getBestEffortLocation();
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Verify to check in as ${identify.fullName ?? 'yourself'}`,
      });
      if (!result.success) {
        setAuthError(getFingerprintAuthErrorMessage(result.error));
        return;
      }
      punchIn({
        userId: identify.userId,
        latitude: location?.latitude,
        longitude: location?.longitude,
      });
    } finally {
      setIsVerifying(false);
    }
  }

  const identify = identifyData?.identify;

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <YStack flex={1} gap="$4" p="$4" background="$background">
        <H1>Attendance</H1>
        <Text color="$color10">
          Enter your email, then verify your face or fingerprint — that verification is your
          check-in or check-out. No password, ever.
        </Text>

        {submittedEmail === null ? (
          <>
            <Input
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setEmailError(null);
              }}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              returnKeyType="go"
              onSubmitEditing={handleContinue}
            />
            {emailError ? <FeedbackBanner variant="error" message={emailError} /> : null}
            <Button onPress={handleContinue}>Continue</Button>
          </>
        ) : (
          <>
            {isIdentifying ? (
              <YStack gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Spinner />
                <Text color="$color10">Looking up your account...</Text>
              </YStack>
            ) : null}

            {isIdentifyError ? (
              <FeedbackBanner variant="error" message={getErrorMessage(identifyError)} />
            ) : null}

            {identify ? (
              <>
                <FeedbackBanner variant="success" message={`Welcome back, ${identify.fullName}.`} />

                {!identify.fingerprintEnrolled ? (
                  <FeedbackBanner
                    variant="info"
                    message="Fingerprint isn't set up for this account yet. Face check-in is coming soon."
                  />
                ) : null}

                {identify.fingerprintEnrolled && hardwareStatus === 'no-hardware' ? (
                  <FeedbackBanner
                    variant="error"
                    message="This device has no biometric hardware. Fingerprint check-in isn't available here."
                  />
                ) : null}

                {identify.fingerprintEnrolled && hardwareStatus === 'not-enrolled' ? (
                  <FeedbackBanner
                    variant="error"
                    message="No fingerprint is enrolled on this device. Enroll one in Settings, then retry."
                  />
                ) : null}

                {authError ? <FeedbackBanner variant="error" message={authError} /> : null}
                {isPunchError ? (
                  <FeedbackBanner variant="error" message={getErrorMessage(punchError)} />
                ) : null}

                {identify.fingerprintEnrolled && hardwareStatus === 'ready' ? (
                  <Button
                    onPress={handleVerify}
                    disabled={isVerifying || isPunchingIn}
                    {...(isVerifying || isPunchingIn ? { icon: <Spinner /> } : {})}
                  >
                    {isPunchingIn ? 'Recording punch...' : 'Verify Fingerprint'}
                  </Button>
                ) : null}
              </>
            ) : null}

            <Button onPress={handleUseDifferentEmail}>Use a different email</Button>
          </>
        )}
        <YStack style={{ height: insets.bottom }} />
      </YStack>
    </ScrollView>
  );
}
