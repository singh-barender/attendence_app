/**
 * The tapped-day detail panel below `AttendanceCalendar`'s grid, split out
 * (coding-standards.md's "small, modular, single-responsibility files").
 */
import { Text, XStack, YStack } from 'tamagui';
import type { AttendanceDay } from '../utils/calendarGrid';
import { formatDisplayDate, formatHoursWorked, formatPunchTime } from '../utils/formatDateTime';
import { PunchLocation } from './PunchLocation';
import { StatusBadge } from './StatusBadge';

export function CalendarDayDetail({
  selectedDate,
  selectedDay,
}: {
  selectedDate: string;
  selectedDay: AttendanceDay | undefined;
}) {
  return (
    <YStack gap="$2" borderWidth={1} borderColor="$borderColor" p="$3" style={{ borderRadius: 8 }}>
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
            {selectedDay.checkIn?.timestamp ? formatPunchTime(selectedDay.checkIn.timestamp) : '—'}
            {'   '}
            Check-out:{' '}
            {selectedDay.checkOut?.timestamp
              ? formatPunchTime(selectedDay.checkOut.timestamp)
              : '—'}
          </Text>
          {selectedDay.hoursWorked != null ? (
            <Text color="$color10">Hours worked: {formatHoursWorked(selectedDay.hoursWorked)}</Text>
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
  );
}
