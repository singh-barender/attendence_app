/**
 * Small, pure display rows used only by `ProfileScreen` — split out
 * (coding-standards.md's "small, modular, single-responsibility files") so
 * the screen file itself stays focused on data-fetching/orchestration.
 * Grouped in one file (not four near-empty ones) since these are genuinely
 * tiny, thematically identical "one label + one value" primitives, not
 * independent concerns.
 */
import { Text, XStack, YStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import type { VerificationMethod, VerificationOutcome } from '../generated/graphql';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { formatAttemptTimestamp } from '../utils/formatDateTime';

/** Small uppercase "eyebrow" section heading, matching the glass-card
 * aesthetic — used in place of a plain `H3` at the top of every card. */
export function SectionHeading({ children }: { children: string }) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  return (
    <Text
      style={{
        color: palette.accent,
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  );
}

export function EnrollmentRow({ label, enrolled }: { label: string; enrolled: boolean }) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  return (
    <XStack style={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ color: palette.inkSoft }}>{label}</Text>
      <Text
        color={enrolled ? '$green10' : undefined}
        style={enrolled ? undefined : { color: palette.inkSoft }}
        fontWeight="600"
      >
        {enrolled ? 'Enrolled' : 'Not enrolled'}
      </Text>
    </XStack>
  );
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  return (
    <XStack style={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ color: palette.inkSoft }}>{label}</Text>
      <Text style={{ color: palette.ink }}>{value}</Text>
    </XStack>
  );
}

const METHOD_LABELS: Record<VerificationMethod, string> = {
  FACE: 'Face',
  FINGERPRINT: 'Fingerprint',
};

export function VerificationAttemptRow({
  method,
  outcome,
  matchScore,
  timestamp,
}: {
  method: VerificationMethod;
  outcome: VerificationOutcome;
  matchScore: number | null;
  timestamp: string;
}) {
  const isSuccess = outcome === 'SUCCESS';
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  return (
    <XStack style={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <YStack>
        <Text style={{ color: palette.ink }}>{METHOD_LABELS[method]}</Text>
        <Text style={{ color: palette.inkSoft }} fontSize="$2">
          {formatAttemptTimestamp(timestamp)}
          {matchScore != null ? ` — score ${matchScore.toFixed(2)}` : ''}
        </Text>
      </YStack>
      <Text color={isSuccess ? '$green10' : '$red10'} fontWeight="600">
        {isSuccess ? 'Success' : 'Failure'}
      </Text>
    </XStack>
  );
}
