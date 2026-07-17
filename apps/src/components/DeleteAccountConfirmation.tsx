/**
 * Type-to-confirm account deletion, split out of `ProfileScreen`
 * (coding-standards.md's "small, modular, single-responsibility files") —
 * account deletion (ADR-020) is irreversible, so it's gated by a
 * type-to-confirm text input rather than a single tap. This app has no
 * dialog/modal library anywhere (confirmed against tech-stack.md), and the
 * interaction is simple enough to build from primitives already in use,
 * matching ADR-021's own reasoning for not adding a library for a single
 * one-off use.
 */
import { useState } from 'react';
import { Button, Input, Spinner, Text, XStack, YStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { FeedbackBanner } from './FeedbackBanner';

export const DELETE_CONFIRMATION_PHRASE = 'DELETE';

export function DeleteAccountConfirmation({
  onConfirm,
  onCancel,
  isDeleting,
  deleteError,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
  deleteError: string | null;
}) {
  const [confirmText, setConfirmText] = useState('');
  const canConfirm = confirmText === DELETE_CONFIRMATION_PHRASE;
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];

  return (
    <YStack gap="$2">
      <FeedbackBanner
        variant="error"
        message="This permanently deletes your account and all attendance, enrollment, and verification data. This cannot be undone."
      />
      <Text style={{ color: palette.inkSoft }}>
        Type {DELETE_CONFIRMATION_PHRASE} below to confirm.
      </Text>
      <Input
        value={confirmText}
        onChangeText={setConfirmText}
        autoCapitalize="characters"
        placeholder={DELETE_CONFIRMATION_PHRASE}
        editable={!isDeleting}
      />
      {deleteError ? <FeedbackBanner variant="error" message={deleteError} /> : null}
      <XStack gap="$2">
        <Button flex={1} onPress={onCancel} disabled={isDeleting}>
          Cancel
        </Button>
        <Button
          flex={1}
          onPress={onConfirm}
          disabled={!canConfirm || isDeleting}
          style={{ backgroundColor: palette.danger, opacity: !canConfirm || isDeleting ? 0.5 : 1 }}
          {...(isDeleting ? { icon: <Spinner /> } : {})}
        >
          <Text style={{ color: palette.dangerInk, fontWeight: '700' }}>
            {isDeleting ? 'Deleting...' : 'Permanently delete'}
          </Text>
        </Button>
      </XStack>
    </YStack>
  );
}
