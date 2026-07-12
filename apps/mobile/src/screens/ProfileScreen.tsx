/**
 * Account info + enrollment status display (task 4.1), re-enrollment
 * actions (task 4.2, ADR-018), a verification-activity audit trail (task
 * 4.4, ADR-019), self-service data export + account deletion (task
 * 4.5/4.6, ADR-020), and a light/dark theme toggle (task 4.7, ADR-009) —
 * reads the `me`, `myVerificationAttempts`, and (on demand) `exportMyData`
 * queries, plus `useThemePreference()` for the toggle.
 *
 * `useFocusEffect` refetches `me`/`myVerificationAttempts` whenever this
 * screen regains focus — React Navigation keeps this screen instance
 * mounted underneath ReEnrollFace/ReEnrollFingerprint rather than
 * remounting it on the way back, so without an explicit refetch the
 * enrollment status and activity list would still reflect
 * pre-re-enrollment/pre-punch state. `exportMyData` is deliberately not
 * auto-fetched (`enabled: false`) — it's an on-demand user action
 * triggered by the Download button, not something every profile visit
 * needs to fetch.
 *
 * Account deletion (task 4.6) is irreversible (ADR-020), so it's gated by
 * a type-to-confirm text input rather than a single tap — this app has no
 * dialog/modal library anywhere (confirmed against tech-stack.md before
 * building this: none is installed or pinned), and the interaction is
 * simple enough to build from primitives already in use here, matching
 * ADR-021's own reasoning for not adding a library for a single one-off
 * use.
 */
import { useFocusEffect } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { Button, Input, Spinner, Text, XStack, YStack } from 'tamagui';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { GlassCard } from '../components/GlassCard';
import { ScreenContainer } from '../components/ScreenContainer';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import {
  useDeleteMyAccountMutation,
  useExportMyDataQuery,
  useMeQuery,
  useMyVerificationAttemptsQuery,
  type VerificationMethod,
  type VerificationOutcome,
} from '../generated/graphql';
import type { RootScreenProps } from '../navigation/types';
import { FINGERPRINT_SUPPORTED } from '../platform/biometric';
import { saveMyDataExport } from '../platform/dataExport';
import { getErrorMessage } from '../services/graphqlError';
import {
  disableMissedCheckoutAlert,
  enableMissedCheckoutAlert,
  isMissedCheckoutAlertEnabled,
} from '../services/missedCheckoutTask';
import {
  disableDailyReminder,
  enableDailyReminder,
  isDailyReminderEnabled,
  NOTIFICATIONS_SUPPORTED,
} from '../services/notifications';
import { logout } from '../services/session';
import { GLASS_PALETTES } from '../theme/glassPalette';
import {
  formatAttemptTimestamp,
  formatMemberSince,
  formatRelativeTime,
} from '../utils/formatDateTime';

const DELETE_CONFIRMATION_PHRASE = 'DELETE';

/** Small uppercase "eyebrow" section heading, matching the glass-card
 * aesthetic — used in place of a plain `H3` at the top of every card. */
function SectionHeading({ children }: { children: string }) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  return (
    <Text
      style={{
        color: palette.accent,
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </Text>
  );
}

function EnrollmentRow({ label, enrolled }: { label: string; enrolled: boolean }) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  return (
    <XStack style={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ color: palette.inkSoft }}>{label}</Text>
      <Text
        color={enrolled ? '$green10' : undefined}
        style={enrolled ? undefined : { color: palette.inkSoft }}
        fontWeight="600"
      >
        {enrolled ? 'Enrolled' : 'Not enrolled'}
      </Text>
    </XStack>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  return (
    <XStack style={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ color: palette.inkSoft }}>{label}</Text>
      <Text style={{ color: palette.ink }}>{value}</Text>
    </XStack>
  );
}

const METHOD_LABELS: Record<VerificationMethod, string> = {
  FACE: 'Face',
  FINGERPRINT: 'Fingerprint',
};

function VerificationAttemptRow({
  method,
  outcome,
  matchScore,
  timestamp,
}: {
  method: VerificationMethod;
  outcome: VerificationOutcome;
  matchScore: number | null;
  timestamp: string;
}) {
  const isSuccess = outcome === 'SUCCESS';
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  return (
    <XStack style={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <YStack>
        <Text style={{ color: palette.ink }}>{METHOD_LABELS[method]}</Text>
        <Text style={{ color: palette.inkSoft }} fontSize="$2">
          {formatAttemptTimestamp(timestamp)}
          {matchScore != null ? ` — score ${matchScore.toFixed(2)}` : ''}
        </Text>
      </YStack>
      <Text color={isSuccess ? '$green10' : '$red10'} fontWeight="600">
        {isSuccess ? 'Success' : 'Failure'}
      </Text>
    </XStack>
  );
}

function DeleteAccountConfirmation({
  onConfirm,
  onCancel,
  isDeleting,
  deleteError,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
  deleteError: string | null;
}) {
  const [confirmText, setConfirmText] = useState('');
  const canConfirm = confirmText === DELETE_CONFIRMATION_PHRASE;
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];

  return (
    <YStack gap="$2">
      <FeedbackBanner
        variant="error"
        message="This permanently deletes your account and all attendance, enrollment, and verification data. This cannot be undone."
      />
      <Text style={{ color: palette.inkSoft }}>
        Type {DELETE_CONFIRMATION_PHRASE} below to confirm.
      </Text>
      <Input
        value={confirmText}
        onChangeText={setConfirmText}
        autoCapitalize="characters"
        placeholder={DELETE_CONFIRMATION_PHRASE}
        editable={!isDeleting}
      />
      {deleteError ? <FeedbackBanner variant="error" message={deleteError} /> : null}
      <XStack gap="$2">
        <Button flex={1} onPress={onCancel} disabled={isDeleting}>
          Cancel
        </Button>
        <Button
          flex={1}
          onPress={onConfirm}
          disabled={!canConfirm || isDeleting}
          style={{ backgroundColor: palette.danger, opacity: !canConfirm || isDeleting ? 0.5 : 1 }}
          {...(isDeleting ? { icon: <Spinner /> } : {})}
        >
          <Text style={{ color: palette.dangerInk, fontWeight: '700' }}>
            {isDeleting ? 'Deleting...' : 'Permanently delete'}
          </Text>
        </Button>
      </XStack>
    </YStack>
  );
}

export function ProfileScreen({ navigation }: RootScreenProps<'Profile'>) {
  const queryClient = useQueryClient();
  const { resolvedTheme, preference, setPreference } = useThemePreference();
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
  const { refetch: fetchExportData } = useExportMyDataQuery(undefined, { enabled: false });
  const [isDownloadingData, setIsDownloadingData] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isReminderEnabled, setIsReminderEnabled] = useState(false);
  const [isTogglingReminder, setIsTogglingReminder] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [isMissedCheckoutEnabled, setIsMissedCheckoutEnabled] = useState(false);
  const [isTogglingMissedCheckout, setIsTogglingMissedCheckout] = useState(false);
  const [missedCheckoutError, setMissedCheckoutError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!NOTIFICATIONS_SUPPORTED) {
      return;
    }
    isDailyReminderEnabled().then(setIsReminderEnabled);
    isMissedCheckoutAlertEnabled().then(setIsMissedCheckoutEnabled);
  }, []);

  async function handleToggleReminder() {
    setReminderError(null);
    setIsTogglingReminder(true);
    try {
      if (isReminderEnabled) {
        await disableDailyReminder();
        setIsReminderEnabled(false);
        return;
      }
      const granted = await enableDailyReminder();
      if (!granted) {
        setReminderError(
          'Notifications permission was denied — enable it for this app in your device Settings, then try again.',
        );
        return;
      }
      setIsReminderEnabled(true);
    } finally {
      setIsTogglingReminder(false);
    }
  }

  /** Separate from `handleToggleReminder` (own state, own toggle) — this one
   * registers recurring background execution, a meaningfully different
   * resource cost from a single scheduled alarm, so the user can opt into
   * each independently rather than one toggle silently doing both. */
  async function handleToggleMissedCheckout() {
    setMissedCheckoutError(null);
    setIsTogglingMissedCheckout(true);
    try {
      if (isMissedCheckoutEnabled) {
        await disableMissedCheckoutAlert();
        setIsMissedCheckoutEnabled(false);
        return;
      }
      const granted = await enableMissedCheckoutAlert();
      if (!granted) {
        setMissedCheckoutError(
          'Notifications permission was denied — enable it for this app in your device Settings, then try again.',
        );
        return;
      }
      setIsMissedCheckoutEnabled(true);
    } finally {
      setIsTogglingMissedCheckout(false);
    }
  }

  async function handleDownloadData() {
    setDownloadError(null);
    setIsDownloadingData(true);
    try {
      const result = await fetchExportData();
      if (result.error) {
        throw result.error;
      }
      if (!result.data?.exportMyData) {
        throw new Error('No data returned.');
      }
      await saveMyDataExport(result.data.exportMyData);
    } catch (err) {
      setDownloadError(getErrorMessage(err, 'Failed to export your data.'));
    } finally {
      setIsDownloadingData(false);
    }
  }

  const errorMessage = isError ? getErrorMessage(error) : null;
  const isUnauthorized = errorMessage?.includes('Unauthorized') ?? false;
  const profile = data?.me;
  /** "Last verified" trust indicator (task 4.13 follow-up) — derived from
   * the audit trail `myVerificationAttempts` already fetches (task 4.4), not
   * a new query. Only a *successful* attempt counts as "verified"; a failed
   * one isn't. Attempts are already ordered most-recent-first, so the first
   * SUCCESS entry is the most recent one. */
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
          <GlassCard>
            <SectionHeading>Account</SectionHeading>
            <InfoRow label="Name" value={profile.fullName ?? '—'} />
            <InfoRow label="Email" value={profile.email ?? '—'} />
            {profile.age != null ? <InfoRow label="Age" value={String(profile.age)} /> : null}
            {profile.gender ? <InfoRow label="Gender" value={profile.gender} /> : null}
            {profile.location ? <InfoRow label="Location" value={profile.location} /> : null}
            {profile.createdAt ? (
              <InfoRow label="Member since" value={formatMemberSince(profile.createdAt)} />
            ) : null}
            {lastSuccessfulVerification?.timestamp ? (
              <InfoRow
                label="Last verified"
                value={formatRelativeTime(lastSuccessfulVerification.timestamp)}
              />
            ) : null}
          </GlassCard>

          <GlassCard>
            <SectionHeading>Enrollment status</SectionHeading>
            <EnrollmentRow
              label="Face"
              enrolled={profile.enrollmentStatus?.faceEnrolled ?? false}
            />
            {FINGERPRINT_SUPPORTED ? (
              <EnrollmentRow
                label="Fingerprint"
                enrolled={profile.enrollmentStatus?.fingerprintEnrolled ?? false}
              />
            ) : null}
            {/* Stacked full-width (matching the Data Controls card below)
                rather than side-by-side: "Re-enroll fingerprint" is too long
                to fit a half-width button and was truncating to
                "Re-enroll fingerpri…". */}
            <YStack gap="$2" mt="$2">
              <Button size="$3" onPress={() => navigation.navigate('ReEnrollFace')}>
                Re-enroll face
              </Button>
              {FINGERPRINT_SUPPORTED ? (
                <Button size="$3" onPress={() => navigation.navigate('ReEnrollFingerprint')}>
                  Re-enroll fingerprint
                </Button>
              ) : null}
            </YStack>
          </GlassCard>

          <GlassCard>
            <SectionHeading>Verification activity</SectionHeading>
            {isAttemptsLoading ? (
              <YStack gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Spinner />
                <Text style={{ color: palette.inkSoft }}>Loading activity...</Text>
              </YStack>
            ) : null}
            {isAttemptsError ? (
              <YStack gap="$2">
                <FeedbackBanner variant="error" message={getErrorMessage(attemptsError)} />
                <Button onPress={() => refetchAttempts()} disabled={isAttemptsRefetching}>
                  {isAttemptsRefetching ? 'Retrying...' : 'Retry'}
                </Button>
              </YStack>
            ) : null}
            {!isAttemptsLoading &&
            !isAttemptsError &&
            (attemptsData?.myVerificationAttempts?.length ?? 0) === 0 ? (
              <FeedbackBanner variant="info" message="No verification attempts yet." />
            ) : null}
            {attemptsData?.myVerificationAttempts?.map((attempt) =>
              attempt.id && attempt.method && attempt.outcome && attempt.timestamp ? (
                <VerificationAttemptRow
                  key={attempt.id}
                  method={attempt.method}
                  outcome={attempt.outcome}
                  matchScore={attempt.matchScore ?? null}
                  timestamp={attempt.timestamp}
                />
              ) : null,
            )}
          </GlassCard>

          <GlassCard>
            <SectionHeading>Appearance</SectionHeading>
            <XStack gap="$2">
              <Button
                flex={1}
                size="$3"
                style={{
                  backgroundColor: preference === 'light' ? palette.accent : undefined,
                }}
                onPress={() => setPreference('light')}
              >
                <Text
                  style={{
                    color: preference === 'light' ? palette.accentInk : palette.inkSoft,
                    fontWeight: '700',
                  }}
                >
                  Light
                </Text>
              </Button>
              <Button
                flex={1}
                size="$3"
                style={{
                  backgroundColor: preference === 'dark' ? palette.accent : undefined,
                }}
                onPress={() => setPreference('dark')}
              >
                <Text
                  style={{
                    color: preference === 'dark' ? palette.accentInk : palette.inkSoft,
                    fontWeight: '700',
                  }}
                >
                  Dark
                </Text>
              </Button>
              <Button
                flex={1}
                size="$3"
                style={{
                  backgroundColor: preference === 'system' ? palette.accent : undefined,
                }}
                onPress={() => setPreference('system')}
              >
                <Text
                  style={{
                    color: preference === 'system' ? palette.accentInk : palette.inkSoft,
                    fontWeight: '700',
                  }}
                >
                  System
                </Text>
              </Button>
            </XStack>
          </GlassCard>

          {NOTIFICATIONS_SUPPORTED ? (
            <GlassCard>
              <SectionHeading>Notifications</SectionHeading>
              <Text style={{ color: palette.inkSoft }}>
                A daily local reminder to check in — no account/server involved, purely on this
                device.
              </Text>
              {reminderError ? <FeedbackBanner variant="error" message={reminderError} /> : null}
              <Button
                onPress={handleToggleReminder}
                disabled={isTogglingReminder}
                style={{ backgroundColor: isReminderEnabled ? palette.accent : undefined }}
                {...(isTogglingReminder ? { icon: <Spinner /> } : {})}
              >
                <Text
                  style={{
                    color: isReminderEnabled ? palette.accentInk : palette.inkSoft,
                    fontWeight: '700',
                  }}
                >
                  {isReminderEnabled ? 'DAILY REMINDER: ON' : 'DAILY REMINDER: OFF'}
                </Text>
              </Button>

              <Text style={{ color: palette.inkSoft }}>
                A low-frequency background check (at most every 15 minutes, batched by the OS) that
                alerts you if a check-in has stayed open unusually long.
              </Text>
              {missedCheckoutError ? (
                <FeedbackBanner variant="error" message={missedCheckoutError} />
              ) : null}
              <Button
                onPress={handleToggleMissedCheckout}
                disabled={isTogglingMissedCheckout}
                style={{ backgroundColor: isMissedCheckoutEnabled ? palette.accent : undefined }}
                {...(isTogglingMissedCheckout ? { icon: <Spinner /> } : {})}
              >
                <Text
                  style={{
                    color: isMissedCheckoutEnabled ? palette.accentInk : palette.inkSoft,
                    fontWeight: '700',
                  }}
                >
                  {isMissedCheckoutEnabled
                    ? 'MISSED CHECKOUT ALERTS: ON'
                    : 'MISSED CHECKOUT ALERTS: OFF'}
                </Text>
              </Button>
            </GlassCard>
          ) : null}

          <GlassCard>
            <SectionHeading>Data controls</SectionHeading>
            {downloadError ? <FeedbackBanner variant="error" message={downloadError} /> : null}
            <Button
              onPress={handleDownloadData}
              disabled={isDownloadingData}
              {...(isDownloadingData ? { icon: <Spinner /> } : {})}
            >
              {isDownloadingData ? 'Preparing download...' : 'Download my data'}
            </Button>

            <Button onPress={handleLogout} variant="outlined">
              <Text style={{ color: palette.ink, fontWeight: '600' }}>Log out</Text>
            </Button>

            {isConfirmingDelete ? (
              <DeleteAccountConfirmation
                onConfirm={() => deleteAccount({})}
                onCancel={() => setIsConfirmingDelete(false)}
                isDeleting={isDeleting}
                deleteError={isDeleteError ? getErrorMessage(deleteError) : null}
              />
            ) : (
              <Button
                onPress={() => setIsConfirmingDelete(true)}
                style={{ backgroundColor: palette.danger }}
              >
                <Text style={{ color: palette.dangerInk, fontWeight: '700', letterSpacing: 1 }}>
                  DELETE MY ACCOUNT
                </Text>
              </Button>
            )}
          </GlassCard>
        </YStack>
      ) : null}

      <Button onPress={() => navigation.navigate('Attendance')}>Back to attendance</Button>
    </ScreenContainer>
  );
}
