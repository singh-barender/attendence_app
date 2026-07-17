/**
 * The weekday header row + week-of-cells grid in `AttendanceCalendar`,
 * split out (coding-standards.md's "small, modular, single-responsibility
 * files").
 */
import { Text, XStack, YStack } from 'tamagui';
import type { AttendanceDay, GridCell } from '../utils/calendarGrid';
import { WEEKDAY_LABELS } from '../utils/calendarGrid';
import { CalendarDayCell } from './CalendarDayCell';

export interface CalendarMonthGridProps {
  weeks: (GridCell | null)[][];
  dayByDate: Map<string, AttendanceDay>;
  selectedDate: string | null;
  onSelectDate: (dateOnly: string) => void;
}

export function CalendarMonthGrid({
  weeks,
  dayByDate,
  selectedDate,
  onSelectDate,
}: CalendarMonthGridProps) {
  return (
    <>
      <XStack>
        {WEEKDAY_LABELS.map((label) => (
          <YStack key={label} flex={1} style={{ alignItems: 'center' }}>
            <Text color="$color10" fontSize="$1">
              {label}
            </Text>
          </YStack>
        ))}
      </XStack>

      <YStack gap="$1">
        {weeks.map((week, weekIndex) => (
          <XStack
            key={
              // Weeks are a fixed-length, static, non-reorderable sequence
              // for the currently-displayed month.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              weekIndex
            }
            gap="$1"
          >
            {week.map((cell, cellIndex) =>
              cell ? (
                <CalendarDayCell
                  key={cell.dateOnly}
                  cell={cell}
                  day={dayByDate.get(cell.dateOnly)}
                  isSelected={cell.dateOnly === selectedDate}
                  onPress={() => onSelectDate(cell.dateOnly)}
                />
              ) : (
                <YStack
                  key={
                    // Leading/trailing blanks are fixed positions within a
                    // static week row, never reordered.
                    // biome-ignore lint/suspicious/noArrayIndexKey: see above
                    cellIndex
                  }
                  flex={1}
                  height={40}
                />
              ),
            )}
          </XStack>
        ))}
      </YStack>
    </>
  );
}
