/**
 * The "Verification activity" card on `ProfileScreen`, split out
 * (coding-standards.md's "small, modular, single-responsibility files").
 */
import { Button, Spinner, Text, YStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import type { MyVerificationAttemptsQuery } from '../generated/graphql';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { FeedbackBanner } from './FeedbackBanner';
import { GlassCard } from './GlassCard';
import { SectionHeading, VerificationAttemptRow } from './ProfileRows';

export interface ProfileVerificationActivityCardProps {
  attempts: MyVerificationAttemptsQuery['myVerificationAttempts'] | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  isRefetching: boolean;
  onRetry: () => void;
}

export function ProfileVerificationActivityCard({
  attempts,
  isLoading,
  isError,
  errorMessage,
  isRefetching,
  onRetry,
}: ProfileVerificationActivityCardProps) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];

  return (
    <GlassCard>
      <SectionHeading>Verification activity</SectionHeading>
      {isLoading ? (
        <YStack gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Spinner />
          <Text style={{ color: palette.inkSoft }}>Loading activity...</Text>
        </YStack>
      ) : null}
      {isError ? (
        <YStack gap="$2">
          <FeedbackBanner variant="error" message={errorMessage ?? 'Something went wrong.'} />
          <Button onPress={onRetry} disabled={isRefetching}>
            {isRefetching ? 'Retrying...' : 'Retry'}
          </Button>
        </YStack>
      ) : null}
      {!isLoading && !isError && (attempts?.length ?? 0) === 0 ? (
        <FeedbackBanner variant="info" message="No verification attempts yet." />
      ) : null}
      {attempts?.map((attempt) =>
        attempt.id && attempt.method && attempt.outcome && attempt.timestamp ? (
          <VerificationAttemptRow
            key={attempt.id}
            method={attempt.method}
            outcome={attempt.outcome}
            matchScore={attempt.matchScore ?? null}
            timestamp={attempt.timestamp}
          />
        ) : null,
      )}
    </GlassCard>
  );
}
