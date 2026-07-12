/**
 * Shared hardware-status-driven UI + live `BiometricPrompt` confirmation
 * (ADR-005) — extracted from Step2FingerprintScreen (task 4.2) so
 * registration and profile-screen re-enrollment don't each hand-duplicate
 * the same checking/no-hardware/not-enrolled/ready states and the
 * `authenticateAsync` call. Only ever rendered when `FINGERPRINT_SUPPORTED`
 * is true — registration's web "skip this step" path and gating the
 * re-enrollment entry point off the profile screen both stay in their own
 * callers, since neither is this panel's concern.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import { useState } from 'react';
import { Button, Spinner, Text, YStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { useFingerprintHardwareStatus } from '../hooks/useFingerprintHardwareStatus';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { getFingerprintAuthErrorMessage } from '../utils/fingerprintAuthErrors';
import { FeedbackBanner } from './FeedbackBanner';
import { FingerprintScanHint } from './FingerprintScanHint';

interface FingerprintConfirmationPanelProps {
  promptMessage: string;
  confirmLabel: string;
  onConfirmed: () => void;
  isSubmitting: boolean;
  submitError: string | null;
}

export function FingerprintConfirmationPanel({
  promptMessage,
  confirmLabel,
  onConfirmed,
  isSubmitting,
  submitError,
}: FingerprintConfirmationPanelProps) {
  const { status: hardwareStatus, retry: checkHardware } = useFingerprintHardwareStatus();
  const [authError, setAuthError] = useState<string | null>(null);
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];

  async function handleConfirm() {
    setAuthError(null);
    const result = await LocalAuthentication.authenticateAsync({ promptMessage });

    if (!result.success) {
      setAuthError(getFingerprintAuthErrorMessage(result.error));
      return;
    }

    onConfirmed();
  }

  return (
    <YStack gap="$4">
      {hardwareStatus === 'checking' ? (
        <YStack gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Spinner />
          <Text style={{ color: palette.inkSoft }}>Checking device hardware...</Text>
        </YStack>
      ) : null}

      {hardwareStatus === 'no-hardware' ? (
        <FeedbackBanner
          variant="error"
          message="This device has no biometric hardware. Fingerprint isn't available here."
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

      {hardwareStatus === 'ready' ? <FingerprintScanHint /> : null}

      {hardwareStatus === 'ready' && !authError && !submitError ? (
        <FeedbackBanner variant="success" message="Fingerprint sensor ready to confirm." />
      ) : null}

      {authError ? <FeedbackBanner variant="error" message={authError} /> : null}
      {submitError ? <FeedbackBanner variant="error" message={submitError} /> : null}

      {hardwareStatus === 'ready' ? (
        <Button
          onPress={handleConfirm}
          disabled={isSubmitting}
          style={{ backgroundColor: palette.accent }}
          {...(isSubmitting ? { icon: <Spinner /> } : {})}
        >
          <Text style={{ color: palette.accentInk, fontWeight: '700', letterSpacing: 1 }}>
            {(isSubmitting ? 'Confirming...' : confirmLabel).toUpperCase()}
          </Text>
        </Button>
      ) : null}
    </YStack>
  );
}
