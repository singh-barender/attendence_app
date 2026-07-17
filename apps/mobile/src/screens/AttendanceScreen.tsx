/**
 * Attendance history — list view (task 1.19) plus a color-coded calendar
 * view (task 4.3, ADR-021), toggled by the user; both read the same
 * `attendanceHistory` data, so switching views needs no new fetch. Also the
 * CSV export share flow (task 1.20, ADR-014). Requires auth (a session
 * token from a punch-in, task 1.18) — an unauthenticated visit gets a clear
 * "punch in first" message instead of a raw GraphQL error.
 *
 * This screen is a thin orchestrator (coding-standards.md's "small, modular,
 * single-responsibility files") — CSV export is `AttendanceExportCard`, the
 * List/Calendar toggle is `AttendanceViewModeToggle`, and each list row is
 * `AttendanceDayListItem`.
 */
import { useMutationState, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RefreshControl } from 'react-native';
import { Button, Spinner, Text, XStack, YStack } from 'tamagui';
import { AttendanceCalendar } from '../components/AttendanceCalendar';
import { AttendanceDayListItem } from '../components/AttendanceDayListItem';
import { AttendanceExportCard } from '../components/AttendanceExportCard';
import { AttendanceStatsCard } from '../components/AttendanceStatsCard';
import { AttendanceViewModeToggle, type ViewMode } from '../components/AttendanceViewModeToggle';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { ScreenContainer } from '../components/ScreenContainer';
import { SessionTimer } from '../components/SessionTimer';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { useAttendanceHistoryQuery, useMeQuery } from '../generated/graphql';
import type { RootScreenProps } from '../navigation/types';
import { getErrorMessage } from '../services/graphqlError';
import { logout } from '../services/session';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { computeMonthlyStats } from '../utils/attendanceStats';

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

      {!isUnauthorized && days.length > 0 ? <AttendanceExportCard /> : null}

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
        <AttendanceViewModeToggle viewMode={viewMode} onChange={setViewMode} />
      ) : null}

      {viewMode === 'calendar' && days.length > 0 ? <AttendanceCalendar days={days} /> : null}

      {viewMode === 'list'
        ? days.map((day) => (day.date ? <AttendanceDayListItem key={day.date} day={day} /> : null))
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
