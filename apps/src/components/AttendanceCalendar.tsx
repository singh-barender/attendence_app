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
 *
 * This component is a thin orchestrator (coding-standards.md's "small,
 * modular, single-responsibility files") — month-grid layout math is
 * `utils/calendarGrid.ts`, and the grid/legend/day-detail are their own
 * `Calendar*` components.
 */
import { useMemo, useState } from 'react';
import { Button, Text, XStack, YStack } from 'tamagui';
import type { AttendanceHistoryQuery } from '../generated/graphql';
import { type AttendanceDay, buildMonthGrid, chunkIntoWeeks } from '../utils/calendarGrid';
import { formatMonthYear } from '../utils/formatDateTime';
import { CalendarDayDetail } from './CalendarDayDetail';
import { CalendarLegend } from './CalendarLegend';
import { CalendarMonthGrid } from './CalendarMonthGrid';

interface AttendanceCalendarProps {
  days: NonNullable<AttendanceHistoryQuery['attendanceHistory']>;
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

  const weeks = useMemo(
    () => chunkIntoWeeks(buildMonthGrid(viewYear, viewMonth)),
    [viewYear, viewMonth],
  );

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

      <CalendarMonthGrid
        weeks={weeks}
        dayByDate={dayByDate}
        selectedDate={selectedDate}
        onSelectDate={(dateOnly) =>
          setSelectedDate((current) => (current === dateOnly ? null : dateOnly))
        }
      />

      <CalendarLegend />

      {selectedDate ? (
        <CalendarDayDetail selectedDate={selectedDate} selectedDay={dayByDate.get(selectedDate)} />
      ) : null}
    </YStack>
  );
}
