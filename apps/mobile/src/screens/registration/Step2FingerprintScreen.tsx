/**
 * Step 2 of registration (requirements.md) — confirms the device's OS-level
 * biometric works via a live `BiometricPrompt` check (ADR-005). This is
 * *not* capturing a fingerprint template — no app can read that from the
 * OS — it only records a confirmation flag via `registerStep2`.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, H1, Spinner, Text, YStack } from 'tamagui';
import { FeedbackBanner } from '../../components/FeedbackBanner';
import { StepProgress } from '../../components/StepProgress';
import { useRegisterStep2Mutation } from '../../generated/graphql';
import { useFingerprintHardwareStatus } from '../../hooks/useFingerprintHardwareStatus';
import type { RootScreenProps } from '../../navigation/types';
import { getErrorMessage } from '../../services/graphqlError';
import { getFingerprintAuthErrorMessage } from '../../utils/fingerprintAuthErrors';

export function Step2FingerprintScreen({ navigation, route }: RootScreenProps<'RegisterStep2'>) {
  const insets = useSafeAreaInsets();
  const { userId } = route.params;
  const { status: hardwareStatus, retry: checkHardware } = useFingerprintHardwareStatus();
  const [authError, setAuthError] = useState<string | null>(null);

  const { mutate, isPending, error, isError } = useRegisterStep2Mutation({
    onSuccess: () => navigation.navigate('RegisterStep3', { userId }),
  });

  async function handleConfirm() {
    setAuthError(null);
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirm your fingerprint to continue registration',
    });

    if (!result.success) {
      setAuthError(getFingerprintAuthErrorMessage(result.error));
      return;
    }

    mutate({ userId, fingerprintConfirmed: true });
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <YStack flex={1} gap="$4" p="$4" background="$background">
        <H1>Confirm Fingerprint</H1>
        <StepProgress step={2} total={3} label="Fingerprint" />
        <Text color="$color10">
          We'll check that your device's fingerprint sensor is set up and working. This doesn't read
          or store your actual fingerprint — only that a live check succeeded. Fingerprint check-in
          is available on Android only.
        </Text>

        {hardwareStatus === 'checking' ? (
          <YStack gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Spinner />
            <Text color="$color10">Checking device hardware...</Text>
          </YStack>
        ) : null}

        {hardwareStatus === 'no-hardware' ? (
          <FeedbackBanner
            variant="error"
            message="This device has no biometric hardware. Fingerprint registration isn't available here."
          />
        ) : null}

        {hardwareStatus === 'not-enrolled' ? (
          <YStack gap="$2">
            <FeedbackBanner
              variant="error"
              message="No fingerprint is enrolled on this device. Enroll one in Settings, then retry."
            />
            <Button onPress={checkHardware}>Retry</Button>
          </YStack>
        ) : null}

        {hardwareStatus === 'ready' && !authError && !isError ? (
          <FeedbackBanner variant="success" message="Fingerprint sensor ready to confirm." />
        ) : null}

        {authError ? <FeedbackBanner variant="error" message={authError} /> : null}
        {isError ? <FeedbackBanner variant="error" message={getErrorMessage(error)} /> : null}

        {hardwareStatus === 'ready' ? (
          <Button
            onPress={handleConfirm}
            disabled={isPending}
            {...(isPending ? { icon: <Spinner /> } : {})}
          >
            {isPending ? 'Confirming...' : 'Confirm Fingerprint'}
          </Button>
        ) : null}
        <YStack style={{ height: insets.bottom }} />
      </YStack>
    </ScrollView>
  );
}
