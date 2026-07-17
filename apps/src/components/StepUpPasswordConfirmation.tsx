/**
 * Server-verifiable step-up gate for sensitive account actions
 * (architecture-review-2026-07-16.md's F11) — re-enrolling face or
 * fingerprint requires re-entering the account password, not just a
 * client-side fingerprint check, because fingerprint success can never be
 * independently verified by the server (ADR-005's device-bound trust
 * limitation); a password re-entry can be, via the same `confirmStepUp`
 * mutation both re-enrollment screens use.
 */
import { useState } from 'react';
import { Button, Spinner, Text, YStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { useConfirmStepUpMutation } from '../generated/graphql';
import { getErrorMessage } from '../services/graphqlError';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { FeedbackBanner } from './FeedbackBanner';
import { PasswordInput } from './PasswordInput';

interface StepUpPasswordConfirmationProps {
  promptMessage: string;
  confirmLabel: string;
  onConfirmed: (stepUpToken: string) => void;
}

export function StepUpPasswordConfirmation({
  promptMessage,
  confirmLabel,
  onConfirmed,
}: StepUpPasswordConfirmationProps) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const { mutate, isPending } = useConfirmStepUpMutation({
    onSuccess: (data) => {
      const stepUpToken = data.confirmStepUp?.stepUpToken;
      if (!stepUpToken) {
        setFormError('Something went wrong confirming your password. Please try again.');
        return;
      }
      onConfirmed(stepUpToken);
    },
    onError: (error) => setFormError(getErrorMessage(error, 'That password is incorrect.')),
  });

  function handleConfirm() {
    if (password.length === 0) {
      setFormError('Enter your password.');
      return;
    }
    setFormError(null);
    mutate({ password });
  }

  return (
    <YStack gap="$4">
      <Text style={{ color: palette.inkSoft }}>{promptMessage}</Text>
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
        onSubmitEditing={handleConfirm}
      />
      {formError ? <FeedbackBanner variant="error" message={formError} /> : null}
      <Button
        onPress={handleConfirm}
        disabled={isPending}
        style={{ backgroundColor: palette.accent }}
        {...(isPending ? { icon: <Spinner /> } : {})}
      >
        <Text style={{ color: palette.accentInk, fontWeight: '700', letterSpacing: 1 }}>
          {(isPending ? 'Confirming...' : confirmLabel).toUpperCase()}
        </Text>
      </Button>
    </YStack>
  );
}
