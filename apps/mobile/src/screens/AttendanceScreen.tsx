/**
 * Attendance history list (task 1.19) — real `attendanceHistory` query, plus
 * the CSV export share flow (task 1.20, ADR-014). Calendar view is deferred
 * to Phase 4 (ADR-021). Requires auth (a session token from a punch-in,
 * task 1.18) — an unauthenticated visit gets a clear "punch in first"
 * message instead of a raw GraphQL error.
 */
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, H1, Spinner, Text, XStack, YStack } from 'tamagui';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { StatusBadge } from '../components/StatusBadge';
import { useAttendanceHistoryQuery } from '../generated/graphql';
import type { RootScreenProps } from '../navigation/types';
import { exportAttendanceCsv } from '../platform/csvExport';
import { getErrorMessage } from '../services/graphqlError';
import { formatDisplayDate, formatHoursWorked, formatPunchTime } from '../utils/formatDateTime';

export function AttendanceScreen({ navigation }: RootScreenProps<'Attendance'>) {
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError, error, refetch, isRefetching } = useAttendanceHistoryQuery();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const errorMessage = isError ? getErrorMessage(error) : null;
  const isUnauthorized = errorMessage?.includes('Unauthorized') ?? false;
  const days = data?.attendanceHistory ?? [];

  async function handleExport() {
    setExportError(null);
    setIsExporting(true);
    try {
      await exportAttendanceCsv();
    } catch (err) {
      setExportError(getErrorMessage(err, 'Failed to export CSV.'));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <YStack flex={1} gap="$4" p="$4" background="$background">
        <H1>Attendance</H1>
        <Text color="$color10">Your check-in and check-out history.</Text>

        {!isUnauthorized && days.length > 0 ? (
          <Button
            onPress={handleExport}
            disabled={isExporting}
            {...(isExporting ? { icon: <Spinner /> } : {})}
          >
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </Button>
        ) : null}
        {exportError ? <FeedbackBanner variant="error" message={exportError} /> : null}

        {isLoading ? (
          <YStack gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Spinner />
            <Text color="$color10">Loading your history...</Text>
          </YStack>
        ) : null}

        {isUnauthorized ? (
          <YStack gap="$2">
            <FeedbackBanner
              variant="info"
              message="Verify your fingerprint to check in first — your history will show up here afterward."
            />
            <Button onPress={() => navigation.navigate('Login')}>Go to check-in</Button>
          </YStack>
        ) : null}

        {isError && !isUnauthorized ? (
          <YStack gap="$2">
            <FeedbackBanner variant="error" message={errorMessage ?? 'Something went wrong.'} />
            <Button onPress={() => refetch()} disabled={isRefetching}>
              {isRefetching ? 'Retrying...' : 'Retry'}
            </Button>
          </YStack>
        ) : null}

        {!isLoading && !isError && days.length === 0 ? (
          <FeedbackBanner variant="info" message="No attendance recorded yet." />
        ) : null}

        {days.map((day) =>
          day.date ? (
            <YStack
              key={day.date}
              gap="$2"
              borderWidth={1}
              borderColor="$borderColor"
              p="$3"
              style={{ borderRadius: 8 }}
            >
              <XStack style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Text color="$color" fontWeight="600">
                  {formatDisplayDate(day.date)}
                </Text>
                {day.status ? <StatusBadge status={day.status} /> : null}
              </XStack>
              <Text color="$color10">
                Check-in: {day.checkIn?.timestamp ? formatPunchTime(day.checkIn.timestamp) : '—'}
                {'   '}
                Check-out: {day.checkOut?.timestamp ? formatPunchTime(day.checkOut.timestamp) : '—'}
              </Text>
              {day.hoursWorked != null ? (
                <Text color="$color10">Hours worked: {formatHoursWorked(day.hoursWorked)}</Text>
              ) : null}
            </YStack>
          ) : null,
        )}

        <Button onPress={() => navigation.navigate('Profile')}>View profile</Button>
        <YStack style={{ height: insets.bottom }} />
      </YStack>
    </ScrollView>
  );
}
