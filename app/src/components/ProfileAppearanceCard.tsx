/**
 * The "Appearance" (theme toggle) card on `ProfileScreen`, split out
 * (coding-standards.md's "small, modular, single-responsibility files").
 */
import { Button, Text, XStack } from 'tamagui';
import type { StoredThemePreference } from '../contexts/ThemePreferenceContext';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { GlassCard } from './GlassCard';
import { SectionHeading } from './ProfileRows';

const OPTIONS: ReadonlyArray<{ value: StoredThemePreference; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function ProfileAppearanceCard() {
  const { resolvedTheme, preference, setPreference } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];

  return (
    <GlassCard>
      <SectionHeading>Appearance</SectionHeading>
      <XStack gap="$2">
        {OPTIONS.map((option) => (
          <Button
            key={option.value}
            flex={1}
            size="$3"
            style={{
              backgroundColor: preference === option.value ? palette.accent : undefined,
            }}
            onPress={() => setPreference(option.value)}
          >
            <Text
              style={{
                color: preference === option.value ? palette.accentInk : palette.inkSoft,
                fontWeight: '700',
              }}
            >
              {option.label}
            </Text>
          </Button>
        ))}
      </XStack>
    </GlassCard>
  );
}
