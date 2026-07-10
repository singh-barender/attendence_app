/**
 * Step 2 of registration (requirements.md) — confirms the device's OS-level
 * biometric works via a live `BiometricPrompt` check (ADR-005). This is
 * *not* capturing a fingerprint template — no app can read that from the
 * OS — it only records a confirmation flag via `registerStep2`. The
 * hardware-status UI and the actual `authenticateAsync` call live in the
 * shared `FingerprintConfirmationPanel` (task 4.2), reused by profile-screen
 * re-enrollment (`ReEnrollFingerprintScreen`).
 */
import { Button, Spinner, Text } from 'tamagui';
import { FeedbackBanner } from '../../components/FeedbackBanner';
import { FingerprintConfirmationPanel } from '../../components/FingerprintConfirmationPanel';
import { GlassCard } from '../../components/GlassCard';
import { ScreenContainer } from '../../components/ScreenContainer';
import { StepProgress } from '../../components/StepProgress';
import { useThemePreference } from '../../contexts/ThemePreferenceContext';
import { useRegisterStep2Mutation } from '../../generated/graphql';
import type { RootScreenProps } from '../../navigation/types';
import { FINGERPRINT_SUPPORTED } from '../../platform/biometric';
import { getErrorMessage } from '../../services/graphqlError';
import { GLASS_PALETTES } from '../../theme/glassPalette';

export function Step2FingerprintScreen({ navigation, route }: RootScreenProps<'RegisterStep2'>) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
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
      <ScreenContainer
        title="Confirm Fingerprint"
        description="Fingerprint check-in isn't available on web — browsers don't expose the OS fingerprint sensor. Face enrollment (next step) is all you need to check in from here."
        progress={<StepProgress step={2} total={3} label="Fingerprint" />}
      >
        <GlassCard>
          {isError ? <FeedbackBanner variant="error" message={getErrorMessage(error)} /> : null}
          <Button
            onPress={handleSkip}
            disabled={isPending}
            style={{ backgroundColor: palette.accent }}
            {...(isPending ? { icon: <Spinner /> } : {})}
          >
            <Text style={{ color: palette.accentInk, fontWeight: '700', letterSpacing: 1 }}>
              {(isPending ? 'Continuing...' : 'Continue').toUpperCase()}
            </Text>
          </Button>
        </GlassCard>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      title="Confirm Fingerprint"
      description="We'll check that your device's fingerprint sensor is set up and working. This doesn't read or store your actual fingerprint — only that a live check succeeded. Fingerprint check-in is available on Android only."
      progress={<StepProgress step={2} total={3} label="Fingerprint" />}
    >
      <GlassCard>
        <FingerprintConfirmationPanel
          promptMessage="Confirm your fingerprint to continue registration"
          confirmLabel="Confirm Fingerprint"
          onConfirmed={() => mutate({ userId, fingerprintConfirmed: true })}
          isSubmitting={isPending}
          submitError={isError ? getErrorMessage(error) : null}
        />
      </GlassCard>
    </ScreenContainer>
  );
}
