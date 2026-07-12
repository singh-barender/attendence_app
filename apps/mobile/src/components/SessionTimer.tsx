/**
 * Live "checked in for Xh Ym" banner for an open (checked-in, not yet
 * checked-out) session — user-requested, shown on both `LoginPunchInScreen`
 * (session-aware routing) and `AttendanceScreen` (so it reads as an
 * always-visible dashboard, not a login-screen-only widget). Reuses
 * `formatHoursWorked` (already used for a completed day's hours-worked
 * display) rather than a second duration formatter.
 *
 * Updates every 30s, not every second — this is a minutes/hours-scale
 * duration, not a stopwatch; second-level precision would just cost extra
 * re-renders for no visible benefit.
 */
import { useEffect, useState } from 'react';
import { Text, YStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { formatHoursWorked } from '../utils/formatDateTime';

const TICK_INTERVAL_MS = 30_000;

export function SessionTimer({ checkInTimestamp }: { checkInTimestamp: string }) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const elapsedHours = (now - new Date(checkInTimestamp).getTime()) / (1000 * 60 * 60);
  const elapsedLabel = elapsedHours < 1 / 60 ? 'Just now' : formatHoursWorked(elapsedHours);

  return (
    <YStack
      style={{
        borderRadius: 8,
        backgroundColor: palette.glassSurface,
        borderWidth: 1,
        borderColor: palette.glassBorder,
        paddingHorizontal: 12,
        paddingVertical: 8,
        alignItems: 'center',
      }}
    >
      <Text style={{ color: palette.inkSoft, fontSize: 12, letterSpacing: 0.5 }}>
        CHECKED IN FOR
      </Text>
      <Text style={{ color: palette.ink, fontSize: 20, fontWeight: '700' }}>{elapsedLabel}</Text>
    </YStack>
  );
}
