/**
 * Attendance history — list view (task 1.19) plus a color-coded calendar
 * view (task 4.3, ADR-021), toggled by the user; both read the same
 * `attendanceHistory` data, so switching views needs no new fetch. Also the
 * CSV export share flow (task 1.20, ADR-014). Requires auth (a session
 * token from a punch-in, task 1.18) — an unauthenticated visit gets a clear
 * "punch in first" message instead of a raw GraphQL error.
 */
import { useMutationState, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RefreshControl } from 'react-native';
import { Button, Spinner, Text, XStack, YStack } from 'tamagui';
import { AttendanceCalendar } from '../components/AttendanceCalendar';
import { AttendanceStatsCard } from '../components/AttendanceStatsCard';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { GlassCard } from '../components/GlassCard';
import { PunchLocation } from '../components/PunchLocation';
import { ScreenContainer } from '../components/ScreenContainer';
import { SessionTimer } from '../components/SessionTimer';
import { StatusBadge } from '../components/StatusBadge';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { useAttendanceHistoryQuery, useMeQuery } from '../generated/graphql';
import type { RootScreenProps } from '../navigation/types';
import { exportAttendanceCsv } from '../platform/csvExport';
import { getErrorMessage } from '../services/graphqlError';
import { logout } from '../services/session';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { computeMonthlyStats } from '../utils/attendanceStats';
import { EXPORT_RANGE_PRESETS, type ExportRangePreset, getDateRange } from '../utils/dateRange';
import { formatDisplayDate, formatHoursWorked, formatPunchTime } from '../utils/formatDateTime';

type ViewMode = 'list' | 'calendar';

export function AttendanceScreen({ navigation }: RootScreenProps<'Attendance'>) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch, isRefetching } = useAttendanceHistoryQuery();
  // Who this device is signed in as — shown on the dashboard so the active
  // session is explicit (user-requested #1), and reinforcing single-active-
  // user: to operate as anyone else you must log out first.
  const { data: meData } = useMeQuery();
  const signedInName = meData?.me?.fullName;
  const signedInEmail = meData?.me?.email;
  const [exportingPreset, setExportingPreset] = useState<ExportRangePreset | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Punches queued offline sit in the mutation cache as *paused* mutations
  // (ADR-017) — counting them here surfaces a "waiting to sync" figure on the
  // dashboard. Reactive via useMutationState, so it updates as they drain.
  const pendingSyncCount = useMutationState({
    filters: { predicate: (mutation) => mutation.state.isPaused },
  }).length;

  const errorMessage = isError ? getErrorMessage(error) : null;
  const isUnauthorized = errorMessage?.includes('Unauthorized') ?? false;
  const days = data?.attendanceHistory ?? [];
  const openSessionDay = days.find((day) => day.status === 'OPEN');
  const monthlyStats = computeMonthlyStats(days);

  async function handleExport(preset: ExportRangePreset) {
    setExportError(null);
    setExportingPreset(preset);
    try {
      await exportAttendanceCsv(getDateRange(preset));
    } catch (err) {
      setExportError(getErrorMessage(err, 'Failed to export CSV.'));
    } finally {
      setExportingPreset(null);
    }
  }

  // Log out ends the device session (token + cache) and returns to Login;
  // it does not check the user out — an open session stays open server-side
  // until a real biometric check-out (ADR-004), it just can't be operated
  // from this device until someone signs back in.
  async function handleLogout() {
    await logout(queryClient);
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }

  return (
    <ScreenContainer
      title="Attendence App"
      description="Your check-in and check-out history."
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
    >
      {!isUnauthorized && signedInEmail ? (
        <Text style={{ color: palette.inkSoft, fontSize: 13 }}>
          Signed in as{' '}
          <Text style={{ color: palette.ink, fontWeight: '600' }}>
            {signedInName ?? signedInEmail}
          </Text>
          {signedInName ? ` · ${signedInEmail}` : ''}
        </Text>
      ) : null}

      {/* Punching is a dashboard action on demand (ADR-030): check out when a
          session is open, check in otherwise. Either way it opens the Punch
          screen, where a real face/fingerprint verification records the event
          — the dashboard never forces it. */}
      {openSessionDay?.checkIn?.timestamp ? (
        <YStack gap="$2">
          <SessionTimer checkInTimestamp={openSessionDay.checkIn.timestamp} />
          <Button
            size="$4"
            onPress={() => navigation.navigate('Punch', { intent: 'checkout' })}
            style={{ backgroundColor: palette.accent }}
          >
            <Text style={{ color: palette.accentInk, fontWeight: '700', letterSpacing: 1 }}>
              PUNCH OUT
            </Text>
          </Button>
        </YStack>
      ) : !isUnauthorized && !isLoading ? (
        <Button
          size="$4"
          onPress={() => navigation.navigate('Punch', { intent: 'checkin' })}
          style={{ backgroundColor: palette.accent }}
        >
          <Text style={{ color: palette.accentInk, fontWeight: '700', letterSpacing: 1 }}>
            PUNCH IN
          </Text>
        </Button>
      ) : null}

      {!isUnauthorized && days.length > 0 ? (
        <AttendanceStatsCard stats={monthlyStats} pendingSyncCount={pendingSyncCount} />
      ) : null}

      {!isUnauthorized && days.length > 0 ? (
        <GlassCard gap="$2">
          <Text style={{ color: palette.ink, fontWeight: '700' }}>Export report (CSV)</Text>
          <Text style={{ color: palette.inkSoft, fontSize: 12 }}>
            Tap a range to download a per-day attendance report.
          </Text>
          <XStack gap="$2" style={{ flexWrap: 'wrap' }}>
            {EXPORT_RANGE_PRESETS.map((preset) => (
              <Button
                key={preset.key}
                size="$3"
                onPress={() => handleExport(preset.key)}
                disabled={exportingPreset !== null}
                {...(exportingPreset === preset.key ? { icon: <Spinner /> } : {})}
              >
                <Text style={{ color: palette.ink }}>{preset.label}</Text>
              </Button>
            ))}
          </XStack>
        </GlassCard>
      ) : null}
      {exportError ? <FeedbackBanner variant="error" message={exportError} /> : null}

      {isLoading ? (
        <YStack gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Spinner />
          <Text style={{ color: palette.inkSoft }}>Loading your history...</Text>
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
        <FeedbackBanner
          variant="info"
          message="No attendance yet — check in from the login screen to get started."
        />
      ) : null}

      {!isUnauthorized && !isError && days.length > 0 ? (
        <XStack gap="$2">
          <Button
            flex={1}
            size="$3"
            style={{ backgroundColor: viewMode === 'list' ? palette.accent : undefined }}
            onPress={() => setViewMode('list')}
          >
            <Text
              style={{
                color: viewMode === 'list' ? palette.accentInk : palette.inkSoft,
                fontWeight: '700',
              }}
            >
              List
            </Text>
          </Button>
          <Button
            flex={1}
            size="$3"
            style={{ backgroundColor: viewMode === 'calendar' ? palette.accent : undefined }}
            onPress={() => setViewMode('calendar')}
          >
            <Text
              style={{
                color: viewMode === 'calendar' ? palette.accentInk : palette.inkSoft,
                fontWeight: '700',
              }}
            >
              Calendar
            </Text>
          </Button>
        </XStack>
      ) : null}

      {viewMode === 'calendar' && days.length > 0 ? <AttendanceCalendar days={days} /> : null}

      {viewMode === 'list'
        ? days.map((day) =>
            day.date ? (
              <GlassCard key={day.date}>
                <XStack style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: palette.ink, fontWeight: '600' }}>
                    {formatDisplayDate(day.date)}
                  </Text>
                  {day.status ? (
                    <StatusBadge status={day.status} isLate={day.isLate ?? false} />
                  ) : null}
                </XStack>
                <Text style={{ color: palette.inkSoft }}>
                  Check-in: {day.checkIn?.timestamp ? formatPunchTime(day.checkIn.timestamp) : '—'}
                  {'   '}
                  Check-out:{' '}
                  {day.checkOut?.timestamp ? formatPunchTime(day.checkOut.timestamp) : '—'}
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
            ) : null,
          )
        : null}

      {!isUnauthorized ? (
        <XStack gap="$2">
          <Button flex={1} onPress={() => navigation.navigate('Profile')}>
            View profile
          </Button>
          <Button flex={1} onPress={handleLogout} variant="outlined">
            <Text style={{ color: palette.ink }}>Log out</Text>
          </Button>
        </XStack>
      ) : (
        <Button onPress={() => navigation.navigate('Profile')}>View profile</Button>
      )}
    </ScreenContainer>
  );
}
