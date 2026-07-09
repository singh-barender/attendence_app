/**
 * Account info + enrollment status display (task 4.1), re-enrollment
 * actions (task 4.2, ADR-018), a verification-activity audit trail (task
 * 4.4, ADR-019), and a "Download my data" export action (task 4.5,
 * ADR-020) — reads the `me`, `myVerificationAttempts`, and (on demand)
 * `exportMyData` queries. Account deletion and the theme toggle are later
 * Phase 4 tasks and aren't part of this screen yet.
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
 */
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Button, H3, Spinner, Text, XStack, YStack } from 'tamagui';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { ScreenContainer } from '../components/ScreenContainer';
import {
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
import { formatAttemptTimestamp, formatMemberSince } from '../utils/formatDateTime';

function EnrollmentRow({ label, enrolled }: { label: string; enrolled: boolean }) {
  return (
    <XStack style={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <Text color="$color10">{label}</Text>
      <Text color={enrolled ? '$green10' : '$color10'} fontWeight="600">
        {enrolled ? 'Enrolled' : 'Not enrolled'}
      </Text>
    </XStack>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <XStack style={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <Text color="$color10">{label}</Text>
      <Text color="$color">{value}</Text>
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
  return (
    <XStack style={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <YStack>
        <Text color="$color">{METHOD_LABELS[method]}</Text>
        <Text color="$color10" fontSize="$2">
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

export function ProfileScreen({ navigation }: RootScreenProps<'Profile'>) {
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

  useFocusEffect(
    useCallback(() => {
      refetch();
      refetchAttempts();
    }, [refetch, refetchAttempts]),
  );

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

  return (
    <ScreenContainer title="Profile" description="Your account info and enrollment status.">
      {isLoading ? (
        <YStack gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Spinner />
          <Text color="$color10">Loading your profile...</Text>
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
          <YStack
            gap="$2"
            borderWidth={1}
            borderColor="$borderColor"
            p="$3"
            style={{ borderRadius: 8 }}
          >
            <H3>Account</H3>
            <InfoRow label="Name" value={profile.fullName ?? '—'} />
            <InfoRow label="Email" value={profile.email ?? '—'} />
            {profile.age != null ? <InfoRow label="Age" value={String(profile.age)} /> : null}
            {profile.gender ? <InfoRow label="Gender" value={profile.gender} /> : null}
            {profile.location ? <InfoRow label="Location" value={profile.location} /> : null}
            {profile.createdAt ? (
              <InfoRow label="Member since" value={formatMemberSince(profile.createdAt)} />
            ) : null}
          </YStack>

          <YStack
            gap="$2"
            borderWidth={1}
            borderColor="$borderColor"
            p="$3"
            style={{ borderRadius: 8 }}
          >
            <H3>Enrollment status</H3>
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
            <XStack gap="$2" mt="$2">
              <Button flex={1} size="$3" onPress={() => navigation.navigate('ReEnrollFace')}>
                Re-enroll face
              </Button>
              {FINGERPRINT_SUPPORTED ? (
                <Button
                  flex={1}
                  size="$3"
                  onPress={() => navigation.navigate('ReEnrollFingerprint')}
                >
                  Re-enroll fingerprint
                </Button>
              ) : null}
            </XStack>
          </YStack>

          <YStack
            gap="$2"
            borderWidth={1}
            borderColor="$borderColor"
            p="$3"
            style={{ borderRadius: 8 }}
          >
            <H3>Verification activity</H3>
            {isAttemptsLoading ? (
              <YStack gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Spinner />
                <Text color="$color10">Loading activity...</Text>
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
          </YStack>

          <YStack
            gap="$2"
            borderWidth={1}
            borderColor="$borderColor"
            p="$3"
            style={{ borderRadius: 8 }}
          >
            <H3>Data controls</H3>
            {downloadError ? <FeedbackBanner variant="error" message={downloadError} /> : null}
            <Button
              onPress={handleDownloadData}
              disabled={isDownloadingData}
              {...(isDownloadingData ? { icon: <Spinner /> } : {})}
            >
              {isDownloadingData ? 'Preparing download...' : 'Download my data'}
            </Button>
          </YStack>
        </YStack>
      ) : null}

      <Button onPress={() => navigation.navigate('Attendance')}>Back to attendance</Button>
    </ScreenContainer>
  );
}
