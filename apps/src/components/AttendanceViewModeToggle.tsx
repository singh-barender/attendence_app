/**
 * The List/Calendar view toggle on `AttendanceScreen`, split out
 * (coding-standards.md's "small, modular, single-responsibility files").
 */
import { Button, Text, XStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { GLASS_PALETTES } from '../theme/glassPalette';

export type ViewMode = 'list' | 'calendar';

export function AttendanceViewModeToggle({
  viewMode,
  onChange,
}: {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];

  return (
    <XStack gap="$2">
      <Button
        flex={1}
        size="$3"
        style={{ backgroundColor: viewMode === 'list' ? palette.accent : undefined }}
        onPress={() => onChange('list')}
      >
        <Text
          style={{
            color: viewMode === 'list' ? palette.accentInk : palette.inkSoft,
            fontWeight: '700',
          }}
        >
          List
        </Text>
      </Button>
      <Button
        flex={1}
        size="$3"
        style={{ backgroundColor: viewMode === 'calendar' ? palette.accent : undefined }}
        onPress={() => onChange('calendar')}
      >
        <Text
          style={{
            color: viewMode === 'calendar' ? palette.accentInk : palette.inkSoft,
            fontWeight: '700',
          }}
        >
          Calendar
        </Text>
      </Button>
    </XStack>
  );
}
