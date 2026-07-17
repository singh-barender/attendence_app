/**
 * A single day's row in `AttendanceScreen`'s list view, split out
 * (coding-standards.md's "small, modular, single-responsibility files").
 */
import { Text, XStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { GLASS_PALETTES } from '../theme/glassPalette';
import type { AttendanceDay } from '../utils/calendarGrid';
import { formatDisplayDate, formatHoursWorked, formatPunchTime } from '../utils/formatDateTime';
import { GlassCard } from './GlassCard';
import { PunchLocation } from './PunchLocation';
import { StatusBadge } from './StatusBadge';

export function AttendanceDayListItem({ day }: { day: AttendanceDay }) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];

  if (!day.date) {
    return null;
  }

  return (
    <GlassCard>
      <XStack style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: palette.ink, fontWeight: '600' }}>{formatDisplayDate(day.date)}</Text>
        {day.status ? <StatusBadge status={day.status} isLate={day.isLate ?? false} /> : null}
      </XStack>
      <Text style={{ color: palette.inkSoft }}>
        Check-in: {day.checkIn?.timestamp ? formatPunchTime(day.checkIn.timestamp) : '—'}
        {'   '}
        Check-out: {day.checkOut?.timestamp ? formatPunchTime(day.checkOut.timestamp) : '—'}
      </Text>
      {day.hoursWorked != null ? (
        <Text style={{ color: palette.inkSoft }}>
          Hours worked: {formatHoursWorked(day.hoursWorked)}
        </Text>
      ) : null}
      {day.checkIn?.latitude != null && day.checkIn.longitude != null ? (
        <PunchLocation
          latitude={day.checkIn.latitude}
          longitude={day.checkIn.longitude}
          address={day.checkIn.address}
        />
      ) : null}
    </GlassCard>
  );
}
