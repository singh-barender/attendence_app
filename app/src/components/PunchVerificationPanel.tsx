/**
 * The "account identified — choose a verification method" panel on the
 * Punch screen, split out of `LoginPunchInScreen` (coding-standards.md's
 * "small, modular, single-responsibility files") — still owns no state of
 * its own, just renders what `useFingerprintVerification`/
 * `useFaceVerificationFlow` (passed through whole, not prop-by-prop) already
 * computed.
 */
import { Button, Spinner, Text } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import type { useFaceVerificationFlow } from '../hooks/useFaceVerificationFlow';
import { FACE_FALLBACK_THRESHOLD } from '../hooks/useFaceVerificationFlow';
import type { FingerprintHardwareStatus } from '../hooks/useFingerprintHardwareStatus';
import type { useFingerprintVerification } from '../hooks/useFingerprintVerification';
import { FINGERPRINT_SUPPORTED } from '../platform/biometric';
import { getErrorMessage } from '../services/graphqlError';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { FaceVerificationCamera } from './FaceVerificationCamera';
import { FeedbackBanner } from './FeedbackBanner';
import { SessionTimer } from './SessionTimer';

/** The account-identity fields this panel needs — derived from the
 * authenticated `me` query by `useSessionRecovery.ts`, not a separate
 * `identify` query (removed entirely, architecture-review-2026-07-16.md's
 * F9 — no legitimate caller was left for it once registerStep1 issues a
 * session token immediately, F2b). Kept as its own small interface here
 * rather than importing a generated query type, since this shape is no
 * longer tied to any one specific GraphQL operation. */
export interface AccountIdentity {
  userId: string | null;
  faceEnrolled: boolean | null;
  fingerprintEnrolled: boolean | null;
  registrationStep: number | null;
}

export interface PunchVerificationPanelProps {
  identify: AccountIdentity;
  /** Sourced from the authenticated `me` query, not `identify` (which no
   * longer exposes a name at all — architecture-review-2026-07-16.md's
   * F2a/F9). */
  accountFullName: string | null;
  openSessionCheckInTimestamp: string | null | undefined;
  onContinueRegistration: () => void;
  hardwareStatus: FingerprintHardwareStatus;
  fingerprintFlow: ReturnType<typeof useFingerprintVerification>;
  faceFlow: ReturnType<typeof useFaceVerificationFlow>;
  /** Whether this account/device could actually use fingerprint instead of
   * face — precomputed by the caller since it depends on both flows' state. */
  canSwitchToFingerprint: boolean;
  /** Abandons the face path in favor of fingerprint — composes both hooks'
   * own handlers, so it stays owned by the caller rather than either hook
   * knowing about the other. */
  onSwitchToFingerprint: () => void;
}

export function PunchVerificationPanel({
  identify,
  accountFullName,
  openSessionCheckInTimestamp,
  onContinueRegistration,
  hardwareStatus,
  fingerprintFlow,
  faceFlow,
  canSwitchToFingerprint,
  onSwitchToFingerprint,
}: PunchVerificationPanelProps) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  const isRegistrationComplete = (identify.registrationStep ?? 3) >= 3;

  return (
    <>
      {accountFullName ? (
        <FeedbackBanner variant="success" message={`Welcome back, ${accountFullName}.`} />
      ) : null}

      {openSessionCheckInTimestamp ? (
        <SessionTimer checkInTimestamp={openSessionCheckInTimestamp} />
      ) : null}

      {(identify.registrationStep ?? 3) < 3 ? (
        <>
          <FeedbackBanner
            variant="info"
            message="Registration isn't finished yet — continue where you left off to enable check-in."
          />
          <Button
            size="$4"
            onPress={onContinueRegistration}
            style={{ backgroundColor: palette.accent }}
          >
            <Text style={{ color: palette.accentInk, fontWeight: '700', letterSpacing: 1 }}>
              CONTINUE REGISTRATION
            </Text>
          </Button>
        </>
      ) : null}

      {isRegistrationComplete ? (
        <>
          {FINGERPRINT_SUPPORTED &&
          identify.fingerprintEnrolled &&
          hardwareStatus === 'no-hardware' ? (
            <FeedbackBanner
              variant="error"
              message="This device has no biometric hardware. Fingerprint check-in isn't available here."
            />
          ) : null}

          {FINGERPRINT_SUPPORTED &&
          identify.fingerprintEnrolled &&
          hardwareStatus === 'not-enrolled' ? (
            <FeedbackBanner
              variant="error"
              message="No fingerprint is enrolled on this device. Enroll one in Settings, then retry."
            />
          ) : null}

          {fingerprintFlow.authError ? (
            <FeedbackBanner variant="error" message={fingerprintFlow.authError} />
          ) : null}
          {fingerprintFlow.isFingerprintPunchPaused ? (
            <FeedbackBanner
              variant="pending"
              message="You're offline — this punch is queued and will sync automatically once you're back online."
            />
          ) : null}
          {fingerprintFlow.isFingerprintPunchError ? (
            <FeedbackBanner
              variant="error"
              message={getErrorMessage(fingerprintFlow.fingerprintPunchError)}
            />
          ) : null}

          {identify.faceEnrolled && faceFlow.isFaceCameraActive ? (
            <FaceVerificationCamera
              cameraRef={faceFlow.cameraRef}
              hasCameraPermission={faceFlow.hasCameraPermission}
              requestCameraPermission={faceFlow.requestCameraPermission}
              hasDevice={faceFlow.hasDevice}
              onFrame={faceFlow.handleFrame}
              onCameraError={(err) =>
                faceFlow.handleFaceFailure(
                  getErrorMessage(err, 'The camera paused for a moment — please try again.'),
                )
              }
              liveness={faceFlow.liveness}
              isFaceAligned={faceFlow.isFaceAligned}
              alignmentReason={faceFlow.alignmentReason}
              cameraLayoutSize={faceFlow.cameraLayoutSize}
              onCameraLayout={faceFlow.setCameraLayoutSize}
              isFaceTimedOut={faceFlow.isFaceTimedOut}
              faceAttemptId={faceFlow.faceAttemptId}
              isProcessingFace={faceFlow.isProcessingFace}
              faceError={faceFlow.faceError}
              isFacePunchError={faceFlow.isFacePunchError}
              facePunchErrorMessage={faceFlow.facePunchErrorMessage}
              isFacePunchPaused={faceFlow.isFacePunchPaused}
              showFallbackGuidance={faceFlow.faceFailureCount >= FACE_FALLBACK_THRESHOLD}
              canSwitchToFingerprint={canSwitchToFingerprint}
              onRetry={faceFlow.handleRetryAfterTimeout}
              onCancel={faceFlow.handleCancelFaceVerification}
              onSwitchToFingerprint={onSwitchToFingerprint}
            />
          ) : null}

          {identify.faceEnrolled && !faceFlow.isFaceCameraActive ? (
            <Button
              onPress={faceFlow.handleStartFaceVerification}
              size="$4"
              style={{ backgroundColor: palette.accent }}
            >
              <Text style={{ color: palette.accentInk, fontWeight: '700', letterSpacing: 1 }}>
                {openSessionCheckInTimestamp ? 'VERIFY FACE TO CHECK OUT' : 'VERIFY FACE'}
              </Text>
            </Button>
          ) : null}

          {FINGERPRINT_SUPPORTED &&
          identify.fingerprintEnrolled &&
          hardwareStatus === 'ready' &&
          !faceFlow.isFaceCameraActive ? (
            <Button
              onPress={() =>
                fingerprintFlow.handleVerifyFingerprint(identify.userId, accountFullName)
              }
              disabled={fingerprintFlow.isVerifying || fingerprintFlow.isPunchingInFingerprint}
              size="$4"
              style={{ backgroundColor: palette.accent }}
              {...(fingerprintFlow.isVerifying ||
              (fingerprintFlow.isPunchingInFingerprint && !fingerprintFlow.isFingerprintPunchPaused)
                ? { icon: <Spinner /> }
                : {})}
            >
              <Text style={{ color: palette.accentInk, fontWeight: '700', letterSpacing: 1 }}>
                {fingerprintFlow.isFingerprintPunchPaused
                  ? 'QUEUED — WILL SYNC'
                  : fingerprintFlow.isPunchingInFingerprint
                    ? 'RECORDING PUNCH...'
                    : openSessionCheckInTimestamp
                      ? 'VERIFY FINGERPRINT TO CHECK OUT'
                      : 'VERIFY FINGERPRINT'}
              </Text>
            </Button>
          ) : null}
        </>
      ) : null}
    </>
  );
}
