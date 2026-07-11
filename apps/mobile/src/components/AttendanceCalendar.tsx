/**
 * Color-coded month calendar for attendance history (task 4.3, ADR-021) —
 * a custom Tamagui component rather than `react-native-calendars` (rejected
 * per ADR-021/tech-stack.md's rejected-dependencies table: no first-class
 * web support, which would risk the native/web visual parity every other
 * screen in this app maintains via Tamagui's universal tokens). Reuses
 * `StatusBadge`'s `STATUS_STYLES` palette rather than inventing a second
 * color mapping for the same four `AttendanceStatus` values, and the same
 * `attendanceHistory` data `AttendanceScreen`'s list view already fetches —
 * no new query. Tapping a day shows its detail below the grid (ADR-021's
 * "tappable for day detail"), including days with no record.
 */
import { useMemo, useState } from 'react';
import { Pressable } from 'react-native';
import { Button, Text, XStack, YStack } from 'tamagui';
import type { AttendanceHistoryQuery } from '../generated/graphql';
import {
  formatDisplayDate,
  formatHoursWorked,
  formatMonthYear,
  formatPunchTime,
  toDateOnlyString,
} from '../utils/formatDateTime';
import { PunchLocation } from './PunchLocation';
import { STATUS_STYLES, StatusBadge } from './StatusBadge';

type AttendanceDay = NonNullable<AttendanceHistoryQuery['attendanceHistory']>[number];

interface AttendanceCalendarProps {
  days: AttendanceDay[];
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WEEK_LENGTH = 7;

interface GridCell {
  dateOnly: string;
  dayNumber: number;
}

function buildMonthGrid(year: number, monthIndex: number): (GridCell | null)[] {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingBlanks = new Date(year, monthIndex, 1).getDay();

  const cells: (GridCell | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const dayNumber = index + 1;
      return { dateOnly: toDateOnlyString(year, monthIndex, dayNumber), dayNumber };
    }),
  ];
  while (cells.length % WEEK_LENGTH !== 0) {
    cells.push(null);
  }
  return cells;
}

function DayCell({
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

export function AttendanceCalendar({ days }: AttendanceCalendarProps) {
  const dayByDate = useMemo(() => {
    const map = new Map<string, AttendanceDay>();
    for (const day of days) {
      if (day.date) {
        map.set(day.date, day);
      }
    }
    return map;
  }, [days]);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const weeks = useMemo(() => {
    const result: (GridCell | null)[][] = [];
    for (let start = 0; start < grid.length; start += WEEK_LENGTH) {
      result.push(grid.slice(start, start + WEEK_LENGTH));
    }
    return result;
  }, [grid]);

  function goToPreviousMonth() {
    setSelectedDate(null);
    if (viewMonth === 0) {
      setViewYear((year) => year - 1);
      setViewMonth(11);
    } else {
      setViewMonth((month) => month - 1);
    }
  }

  function goToNextMonth() {
    setSelectedDate(null);
    if (viewMonth === 11) {
      setViewYear((year) => year + 1);
      setViewMonth(0);
    } else {
      setViewMonth((month) => month + 1);
    }
  }

  const selectedDay = selectedDate ? dayByDate.get(selectedDate) : undefined;

  return (
    <YStack gap="$3">
      <XStack style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Button size="$2" onPress={goToPreviousMonth} accessibilityLabel="Previous month">
          ‹
        </Button>
        <Text color="$color" fontWeight="600">
          {formatMonthYear(viewYear, viewMonth)}
        </Text>
        <Button size="$2" onPress={goToNextMonth} accessibilityLabel="Next month">
          ›
        </Button>
      </XStack>

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
                <DayCell
                  key={cell.dateOnly}
                  cell={cell}
                  day={dayByDate.get(cell.dateOnly)}
                  isSelected={cell.dateOnly === selectedDate}
                  onPress={() =>
                    setSelectedDate((current) => (current === cell.dateOnly ? null : cell.dateOnly))
                  }
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

      {/* Color legend so the day-cell tints are self-explanatory (user-
          requested) — reuses the exact `STATUS_STYLES.calendarBackground`
          swatches the cells themselves use, so the legend can never drift
          from the real colors. */}
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

      {selectedDate ? (
        <YStack
          gap="$2"
          borderWidth={1}
          borderColor="$borderColor"
          p="$3"
          style={{ borderRadius: 8 }}
        >
          <XStack style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Text color="$color" fontWeight="600">
              {formatDisplayDate(selectedDate)}
            </Text>
            {selectedDay?.status ? (
              <StatusBadge status={selectedDay.status} isLate={selectedDay.isLate ?? false} />
            ) : null}
          </XStack>
          {selectedDay ? (
            <>
              <Text color="$color10">
                Check-in:{' '}
                {selectedDay.checkIn?.timestamp
                  ? formatPunchTime(selectedDay.checkIn.timestamp)
                  : '—'}
                {'   '}
                Check-out:{' '}
                {selectedDay.checkOut?.timestamp
                  ? formatPunchTime(selectedDay.checkOut.timestamp)
                  : '—'}
              </Text>
              {selectedDay.hoursWorked != null ? (
                <Text color="$color10">
                  Hours worked: {formatHoursWorked(selectedDay.hoursWorked)}
                </Text>
              ) : null}
              {selectedDay.checkIn?.latitude != null && selectedDay.checkIn.longitude != null ? (
                <PunchLocation
                  latitude={selectedDay.checkIn.latitude}
                  longitude={selectedDay.checkIn.longitude}
                  address={selectedDay.checkIn.address}
                />
              ) : null}
            </>
          ) : (
            <Text color="$color10">No attendance recorded for this day.</Text>
          )}
        </YStack>
      ) : null}
    </YStack>
  );
}
