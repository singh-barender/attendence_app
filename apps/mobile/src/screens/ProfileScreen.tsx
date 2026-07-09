/**
 * Account info + enrollment status display (task 4.1) plus re-enrollment
 * actions (task 4.2, ADR-018) — reads the `me` query, the authenticated
 * counterpart of `identify`'s pre-login lookup. Verification-attempt audit,
 * data export/delete, and the theme toggle are later Phase 4 tasks
 * (ADR-019, ADR-020) and aren't part of this screen yet.
 *
 * `useFocusEffect` refetches `me` whenever this screen regains focus —
 * React Navigation keeps this screen instance mounted underneath
 * ReEnrollFace/ReEnrollFingerprint rather than remounting it on the way
 * back, so without an explicit refetch the enrollment status shown here
 * would still reflect the pre-re-enrollment state.
 */
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { Button, H3, Spinner, Text, XStack, YStack } from 'tamagui';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { ScreenContainer } from '../components/ScreenContainer';
import { useMeQuery } from '../generated/graphql';
import type { RootScreenProps } from '../navigation/types';
import { FINGERPRINT_SUPPORTED } from '../platform/biometric';
import { getErrorMessage } from '../services/graphqlError';
import { formatMemberSince } from '../utils/formatDateTime';

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

export function ProfileScreen({ navigation }: RootScreenProps<'Profile'>) {
  const { data, isLoading, isError, error, refetch, isRefetching } = useMeQuery();

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

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
        </YStack>
      ) : null}

      <Button onPress={() => navigation.navigate('Attendance')}>Back to attendance</Button>
    </ScreenContainer>
  );
}
