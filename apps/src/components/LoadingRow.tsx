/**
 * A spinner + message row, the recurring "this is loading" pattern used
 * across several screens — split out (coding-standards.md's "small,
 * modular, single-responsibility files", DRY) rather than repeating the
 * same `<YStack><Spinner /><Text>...` shape at every call site.
 */
import { Spinner, Text, YStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { GLASS_PALETTES } from '../theme/glassPalette';

export function LoadingRow({ message }: { message: string }) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  return (
    <YStack
      gap="$2"
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
    >
      <Spinner />
      <Text style={{ color: palette.inkSoft }}>{message}</Text>
    </YStack>
  );
}
