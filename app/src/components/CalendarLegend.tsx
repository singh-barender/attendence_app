/**
 * The color legend below `AttendanceCalendar`'s grid, split out
 * (coding-standards.md's "small, modular, single-responsibility files") —
 * reuses the exact `STATUS_STYLES.calendarBackground` swatches the day
 * cells themselves use, so the legend can never drift from the real colors.
 */
import { Text, XStack, YStack } from 'tamagui';
import { STATUS_STYLES } from './StatusBadge';

export function CalendarLegend() {
  return (
    <XStack style={{ flexWrap: 'wrap', gap: 12, paddingHorizontal: 4 }}>
      {Object.entries(STATUS_STYLES).map(([status, style]) => (
        <XStack key={status} style={{ alignItems: 'center', gap: 5 }}>
          <YStack
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: style.calendarBackground,
            }}
          />
          <Text color="$color" fontSize={11}>
            {style.label}
          </Text>
        </XStack>
      ))}
    </XStack>
  );
}
