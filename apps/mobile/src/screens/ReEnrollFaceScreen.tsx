/**
 * Profile-screen re-enrollment for face (task 4.2, ADR-018) — reuses the
 * same `FaceEnrollmentCapture` component Step3FaceEnrollScreen uses during
 * registration, so re-enrollment holds the exact same quality bar as
 * initial enrollment rather than a shortened flow. The backend supersedes
 * (not deletes) the prior embeddings on success (ADR-018), so an old,
 * changed-appearance face can never match again after this completes.
 *
 * Replacing stored face embeddings is a sensitive action (whoever holds an
 * unlocked, still-logged-in device could otherwise re-enroll *their* face and
 * punch in as this account), so it's gated behind a fresh device-biometric
 * check first (user-requested). The gate applies only where a usable
 * fingerprint exists — on web, or a device with no/absent fingerprint, there
 * is no second factor to require, so we proceed rather than lock a legitimate
 * face-only user out of updating their own enrollment.
 */
import { useEffect, useState } from 'react';
import { YStack } from 'tamagui';
import {
  FaceEnrollmentCapture,
  type FaceEnrollmentEmbeddings,
} from '../components/FaceEnrollmentCapture';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { FingerprintConfirmationPanel } from '../components/FingerprintConfirmationPanel';
import { ScreenContainer } from '../components/ScreenContainer';
import { useReEnrollFaceMutation } from '../generated/graphql';
import { useFingerprintHardwareStatus } from '../hooks/useFingerprintHardwareStatus';
import type { RootScreenProps } from '../navigation/types';
import { FINGERPRINT_SUPPORTED } from '../platform/biometric';
import { getErrorMessage } from '../services/graphqlError';

export function ReEnrollFaceScreen({ navigation }: RootScreenProps<'ReEnrollFace'>) {
  const { status: hardwareStatus } = useFingerprintHardwareStatus();
  // Web (no fingerprint API) starts already-verified; native waits for the
  // biometric gate below.
  const [isIdentityVerified, setIsIdentityVerified] = useState(!FINGERPRINT_SUPPORTED);

  // Nothing to gate on if the device has no usable fingerprint — proceed
  // rather than trap the user (they can still re-enroll their own face).
  useEffect(() => {
    if (
      FINGERPRINT_SUPPORTED &&
      (hardwareStatus === 'no-hardware' || hardwareStatus === 'not-enrolled')
    ) {
      setIsIdentityVerified(true);
    }
  }, [hardwareStatus]);

  const { mutate, isPending, error, isError } = useReEnrollFaceMutation({
    onSuccess: () => navigation.navigate('Profile'),
  });

  function handleFinish(embeddings: FaceEnrollmentEmbeddings) {
    mutate({ embeddings });
  }

  return (
    <ScreenContainer
      title="Re-enroll Face"
      description="Capture your face again to replace your current enrollment."
    >
      {isIdentityVerified ? (
        <FaceEnrollmentCapture
          onFinish={handleFinish}
          isSubmitting={isPending}
          submitError={isError ? getErrorMessage(error) : null}
          finishLabel="Finish re-enrollment"
          finishingLabel="Finishing..."
        />
      ) : (
        <YStack gap="$3">
          <FeedbackBanner
            variant="info"
            message="For your security, verify it’s you before replacing your face enrollment."
          />
          <FingerprintConfirmationPanel
            promptMessage="Verify your identity to re-enroll your face"
            confirmLabel="Verify to continue"
            onConfirmed={() => setIsIdentityVerified(true)}
            isSubmitting={false}
            submitError={null}
          />
        </YStack>
      )}
    </ScreenContainer>
  );
}
