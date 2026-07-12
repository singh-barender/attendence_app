/**
 * "This month" summary shown at the top of the Attendance dashboard —
 * present/late/half-day/missed counts plus a headline attendance percentage,
 * all derived client-side from the `attendanceHistory` the screen already
 * fetched (see `computeMonthlyStats`), so this adds no query or backend work.
 * A "pending sync" figure is shown only when offline-queued punches actually
 * exist, so it never adds noise on the common all-synced path.
 */
import { Text, XStack, YStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { GLASS_PALETTES } from '../theme/glassPalette';
import type { MonthlyStats } from '../utils/attendanceStats';
import { GlassCard } from './GlassCard';

interface AttendanceStatsCardProps {
  stats: MonthlyStats;
  pendingSyncCount: number;
}

function StatCell({
  value,
  label,
  color,
}: {
  value: number | string;
  label: string;
  color: string;
}) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  return (
    <YStack style={{ minWidth: 72, alignItems: 'center' }} gap="$1">
      <Text style={{ color, fontSize: 22, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: palette.inkSoft, fontSize: 11, textAlign: 'center' }}>{label}</Text>
    </YStack>
  );
}

export function AttendanceStatsCard({ stats, pendingSyncCount }: AttendanceStatsCardProps) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];

  return (
    <GlassCard gap="$3">
      <XStack style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={{ color: palette.ink, fontWeight: '700' }}>This month</Text>
        <Text style={{ color: palette.accent, fontSize: 26, fontWeight: '800' }}>
          {stats.attendancePercent}%
        </Text>
      </XStack>
      <Text style={{ color: palette.inkSoft, fontSize: 11 }}>
        Attendance — {stats.present} present of {stats.weekdaysElapsed} weekdays so far
      </Text>
      <XStack style={{ justifyContent: 'space-between', flexWrap: 'wrap' }} gap="$2">
        <StatCell value={stats.present} label="Present" color={palette.ink} />
        <StatCell value={stats.fullDays} label="Full days" color="#3DBE6B" />
        <StatCell value={stats.partialDays} label="Half days" color="#C9922E" />
        <StatCell value={stats.late} label="Late" color="#C9922E" />
        <StatCell value={stats.missed} label="Missed" color={palette.danger} />
      </XStack>
      {pendingSyncCount > 0 ? (
        <Text style={{ color: palette.accent, fontSize: 12, fontWeight: '600' }}>
          ⟳ {pendingSyncCount} punch{pendingSyncCount === 1 ? '' : 'es'} waiting to sync
        </Text>
      ) : null}
    </GlassCard>
  );
}
