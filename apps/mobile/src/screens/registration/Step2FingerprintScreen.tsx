/**
 * Step 2 of registration (requirements.md) — confirms the device's OS-level
 * biometric works via a live `BiometricPrompt` check (ADR-005). This is
 * *not* capturing a fingerprint template — no app can read that from the
 * OS — it only records a confirmation flag via `registerStep2`. The
 * hardware-status UI and the actual `authenticateAsync` call live in the
 * shared `FingerprintConfirmationPanel` (task 4.2), reused by profile-screen
 * re-enrollment (`ReEnrollFingerprintScreen`).
 */
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, H1, Spinner, Text, YStack } from 'tamagui';
import { FeedbackBanner } from '../../components/FeedbackBanner';
import { FingerprintConfirmationPanel } from '../../components/FingerprintConfirmationPanel';
import { StepProgress } from '../../components/StepProgress';
import { useRegisterStep2Mutation } from '../../generated/graphql';
import type { RootScreenProps } from '../../navigation/types';
import { FINGERPRINT_SUPPORTED } from '../../platform/biometric';
import { getErrorMessage } from '../../services/graphqlError';

export function Step2FingerprintScreen({ navigation, route }: RootScreenProps<'RegisterStep2'>) {
  const insets = useSafeAreaInsets();
  const { userId } = route.params;

  const { mutate, isPending, error, isError } = useRegisterStep2Mutation({
    onSuccess: () => navigation.navigate('RegisterStep3', { userId }),
  });

  /** Fingerprint is Android-only (ADR-005) — web skips straight past this
   * step rather than blocking registration on hardware that will never
   * exist here, recording `fingerprintConfirmed: false` as the accurate
   * outcome (not attempted, not merely failed). */
  function handleSkip() {
    mutate({ userId, fingerprintConfirmed: false });
  }

  if (!FINGERPRINT_SUPPORTED) {
    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <YStack flex={1} gap="$4" p="$4" background="$background">
          <H1>Confirm Fingerprint</H1>
          <StepProgress step={2} total={3} label="Fingerprint" />
          <Text color="$color10">
            Fingerprint check-in isn't available on web — browsers don't expose the OS fingerprint
            sensor. Face enrollment (next step) is all you need to check in from here.
          </Text>
          {isError ? <FeedbackBanner variant="error" message={getErrorMessage(error)} /> : null}
          <Button
            onPress={handleSkip}
            disabled={isPending}
            {...(isPending ? { icon: <Spinner /> } : {})}
          >
            {isPending ? 'Continuing...' : 'Continue'}
          </Button>
          <YStack style={{ height: insets.bottom }} />
        </YStack>
      </ScrollView>
    );
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

        <FingerprintConfirmationPanel
          promptMessage="Confirm your fingerprint to continue registration"
          confirmLabel="Confirm Fingerprint"
          onConfirmed={() => mutate({ userId, fingerprintConfirmed: true })}
          isSubmitting={isPending}
          submitError={isError ? getErrorMessage(error) : null}
        />
        <YStack style={{ height: insets.bottom }} />
      </YStack>
    </ScrollView>
  );
}
