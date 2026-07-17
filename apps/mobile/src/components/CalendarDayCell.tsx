/**
 * A single tappable day cell in `AttendanceCalendar`'s month grid, split
 * out (coding-standards.md's "small, modular, single-responsibility
 * files").
 */
import { Pressable } from 'react-native';
import { Text, YStack } from 'tamagui';
import type { AttendanceDay, GridCell } from '../utils/calendarGrid';
import { STATUS_STYLES } from './StatusBadge';

export function CalendarDayCell({
  cell,
  day,
  isSelected,
  onPress,
}: {
  cell: GridCell;
  day: AttendanceDay | undefined;
  isSelected: boolean;
  onPress: () => void;
}) {
  const style = day?.status ? STATUS_STYLES[day.status] : null;

  return (
    // A bare `YStack` with `onPress` renders on Android with no touch
    // responder attached at all (confirmed via uiautomator — no clickable
    // node exists at its bounds). `Button` fixed the tap but its internal
    // layout squeezed two-digit day numbers onto two lines, so this uses
    // RN's own `Pressable` (supported on web via react-native-web too) purely
    // for touch handling, wrapping the original unconstrained `YStack` layout.
    <Pressable onPress={onPress} style={{ flex: 1 }}>
      <YStack
        height={40}
        borderWidth={isSelected ? 2 : 1}
        borderColor={isSelected ? '$color' : '$borderColor'}
        style={{
          borderRadius: 6,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: style?.calendarBackground,
        }}
      >
        <Text
          {...(style ? { style: { color: '#FFFFFF' } } : { color: '$color10' })}
          fontSize="$2"
          fontWeight={isSelected ? '700' : '400'}
        >
          {cell.dayNumber}
        </Text>
      </YStack>
    </Pressable>
  );
}
