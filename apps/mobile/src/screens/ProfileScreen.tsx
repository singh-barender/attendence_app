/**
 * Account info + enrollment status display (task 4.1), re-enrollment
 * actions (task 4.2, ADR-018), a verification-activity audit trail (task
 * 4.4, ADR-019), self-service data export + account deletion (task
 * 4.5/4.6, ADR-020), and a light/dark theme toggle (task 4.7, ADR-009) —
 * reads the `me`, `myVerificationAttempts`, and (on demand) `exportMyData`
 * queries.
 *
 * This screen is a thin orchestrator (coding-standards.md's "small, modular,
 * single-responsibility files") — notification-toggle state lives in
 * `useNotificationSettings`, data export in `useDataExport`, and each
 * section is its own `components/Profile*Card.tsx`.
 *
 * `useFocusEffect` refetches `me`/`myVerificationAttempts` whenever this
 * screen regains focus — React Navigation keeps this screen instance
 * mounted underneath ReEnrollFace/ReEnrollFingerprint rather than
 * remounting it on the way back, so without an explicit refetch the
 * enrollment status and activity list would still reflect
 * pre-re-enrollment/pre-punch state.
 */
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Button, Spinner, Text, YStack } from 'tamagui';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { ProfileAccountCard } from '../components/ProfileAccountCard';
import { ProfileAppearanceCard } from '../components/ProfileAppearanceCard';
import { ProfileDataControlsCard } from '../components/ProfileDataControlsCard';
import { ProfileEnrollmentCard } from '../components/ProfileEnrollmentCard';
import { ProfileNotificationsCard } from '../components/ProfileNotificationsCard';
import { ProfileVerificationActivityCard } from '../components/ProfileVerificationActivityCard';
import { ScreenContainer } from '../components/ScreenContainer';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import {
  useDeleteMyAccountMutation,
  useMeQuery,
  useMyVerificationAttemptsQuery,
} from '../generated/graphql';
import { useDataExport } from '../hooks/useDataExport';
import { useNotificationSettings } from '../hooks/useNotificationSettings';
import type { RootScreenProps } from '../navigation/types';
import { getErrorMessage } from '../services/graphqlError';
import { NOTIFICATIONS_SUPPORTED } from '../services/notifications';
import { logout } from '../services/session';
import { GLASS_PALETTES } from '../theme/glassPalette';

export function ProfileScreen({ navigation }: RootScreenProps<'Profile'>) {
  const queryClient = useQueryClient();
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  const { data, isLoading, isError, error, refetch, isRefetching } = useMeQuery();
  const {
    data: attemptsData,
    isLoading: isAttemptsLoading,
    isError: isAttemptsError,
    error: attemptsError,
    refetch: refetchAttempts,
    isRefetching: isAttemptsRefetching,
  } = useMyVerificationAttemptsQuery();
  const dataExport = useDataExport();
  const notifications = useNotificationSettings();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  /** Deletion now requires a step-up confirmation first (a follow-up review
   * finding: it's at least as destructive as re-enrollment, which already
   * requires one) — mirrors ReEnrollFaceScreen/ReEnrollFingerprintScreen's
   * own `stepUpToken` state, reset on cancel so a re-attempt re-confirms
   * the password rather than reusing a lingering value. */
  const [deleteStepUpToken, setDeleteStepUpToken] = useState<string | null>(null);

  const {
    mutate: deleteAccount,
    isPending: isDeleting,
    isError: isDeleteError,
    error: deleteError,
  } = useDeleteMyAccountMutation({
    onSuccess: async () => {
      // Deletion is a logout plus the server-side data removal — reuse the one
      // logout path so token/header/cache are cleared identically either way.
      await logout(queryClient);
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    },
  });

  function handleCancelConfirmingDelete() {
    setIsConfirmingDelete(false);
    setDeleteStepUpToken(null);
  }

  async function handleLogout() {
    await logout(queryClient);
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  }

  useFocusEffect(
    useCallback(() => {
      refetch();
      refetchAttempts();
    }, [refetch, refetchAttempts]),
  );

  const errorMessage = isError ? getErrorMessage(error) : null;
  const isUnauthorized = errorMessage?.includes('Unauthorized') ?? false;
  const profile = data?.me;
  /** "Last verified" trust indicator — derived from the audit trail
   * `myVerificationAttempts` already fetches, not a new query. Attempts are
   * already ordered most-recent-first, so the first SUCCESS entry is the
   * most recent one. */
  const lastSuccessfulVerification = attemptsData?.myVerificationAttempts?.find(
    (attempt) => attempt.outcome === 'SUCCESS',
  );

  return (
    <ScreenContainer title="Profile" description="Your account info and enrollment status.">
      {isLoading ? (
        <YStack gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Spinner />
          <Text style={{ color: palette.inkSoft }}>Loading your profile...</Text>
        </YStack>
      ) : null}

      {isUnauthorized ? (
        <YStack gap="$2">
          <FeedbackBanner
            variant="info"
            message="Verify your fingerprint or face to check in first — your profile will show up here afterward."
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

      {profile ? (
        <YStack gap="$4">
          <ProfileAccountCard
            fullName={profile.fullName}
            email={profile.email}
            age={profile.age}
            gender={profile.gender}
            createdAt={profile.createdAt}
            lastVerifiedTimestamp={lastSuccessfulVerification?.timestamp}
          />

          <ProfileEnrollmentCard
            faceEnrolled={profile.enrollmentStatus?.faceEnrolled ?? false}
            fingerprintEnrolled={profile.enrollmentStatus?.fingerprintEnrolled ?? false}
            onReEnrollFace={() => navigation.navigate('ReEnrollFace')}
            onReEnrollFingerprint={() => navigation.navigate('ReEnrollFingerprint')}
          />

          <ProfileVerificationActivityCard
            attempts={attemptsData?.myVerificationAttempts}
            isLoading={isAttemptsLoading}
            isError={isAttemptsError}
            errorMessage={isAttemptsError ? getErrorMessage(attemptsError) : null}
            isRefetching={isAttemptsRefetching}
            onRetry={() => refetchAttempts()}
          />

          <ProfileAppearanceCard />

          {NOTIFICATIONS_SUPPORTED ? (
            <ProfileNotificationsCard
              isReminderEnabled={notifications.isReminderEnabled}
              isTogglingReminder={notifications.isTogglingReminder}
              reminderError={notifications.reminderError}
              onToggleReminder={notifications.handleToggleReminder}
              isMissedCheckoutEnabled={notifications.isMissedCheckoutEnabled}
              isTogglingMissedCheckout={notifications.isTogglingMissedCheckout}
              missedCheckoutError={notifications.missedCheckoutError}
              onToggleMissedCheckout={notifications.handleToggleMissedCheckout}
            />
          ) : null}

          <ProfileDataControlsCard
            isDownloadingData={dataExport.isDownloadingData}
            downloadError={dataExport.downloadError}
            onDownloadData={dataExport.handleDownloadData}
            onLogout={handleLogout}
            isConfirmingDelete={isConfirmingDelete}
            onStartConfirmingDelete={() => setIsConfirmingDelete(true)}
            onCancelConfirmingDelete={handleCancelConfirmingDelete}
            deleteStepUpToken={deleteStepUpToken}
            onDeleteStepUpConfirmed={setDeleteStepUpToken}
            onConfirmDelete={() => deleteAccount({ stepUpToken: deleteStepUpToken as string })}
            isDeleting={isDeleting}
            deleteError={isDeleteError ? getErrorMessage(deleteError) : null}
          />
        </YStack>
      ) : null}

      <Button onPress={() => navigation.navigate('Attendance')}>Back to attendance</Button>
    </ScreenContainer>
  );
}
