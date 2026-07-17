/**
 * Shared screen chrome (padding, gap, title) so screens don't hand-duplicate
 * the same Tamagui layout — an optional `progress` slot renders between the
 * description and children (used by the registration wizard's step
 * indicator, task 1.15+ UI pass). `keyboardShouldPersistTaps="handled"`
 * avoids the common RN gotcha where a button tap while the keyboard is open
 * gets swallowed as a dismiss-keyboard tap instead of firing onPress.
 * Bottom safe-area inset keeps the last piece of content clear of gesture
 * navigation bars on notched/gesture-nav devices. Top safe-area inset does
 * the equivalent job at the top: with the native header hidden app-wide
 * (RootNavigator's `headerShown: false`), nothing else reserves that space,
 * so without it the title would render flush against the status bar.
 *
 * No opaque background here (user-requested redesign) — the app-wide
 * `GradientBackground` (mounted once in App.tsx) shows through every
 * screen, so title/description use `glassPalette`'s ink colors directly
 * (calibrated for legibility on the colorful gradient) rather than the old
 * flat-background `$color`/`$color10` tokens.
 */
import type { ReactElement, ReactNode } from 'react';
import type { RefreshControlProps } from 'react-native';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { H1, Text, YStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { GLASS_PALETTES } from '../theme/glassPalette';

interface ScreenContainerProps {
  title: string;
  description: string;
  progress?: ReactNode;
  children?: ReactNode;
  /** Optional pull-to-refresh control (a plain RN `<RefreshControl>`),
   * passed straight through to the underlying `ScrollView` — only
   * `AttendanceScreen` uses this today, but it's a generic passthrough
   * rather than something Attendance-specific. */
  refreshControl?: ReactElement<RefreshControlProps>;
}

export function ScreenContainer({
  title,
  description,
  progress,
  children,
  refreshControl,
}: ScreenContainerProps) {
  const insets = useSafeAreaInsets();
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={refreshControl}
    >
      <YStack flex={1} gap="$4" p="$4" style={{ paddingTop: insets.top + 16 }}>
        <H1 style={{ color: palette.ink }}>{title}</H1>
        {progress}
        <Text style={{ color: palette.inkSoft }}>{description}</Text>
        {children}
        <YStack style={{ height: insets.bottom }} />
      </YStack>
    </ScrollView>
  );
}
