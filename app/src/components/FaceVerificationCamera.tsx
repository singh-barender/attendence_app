/**
 * The face-verification camera view, split out of `LoginPunchInScreen` to
 * keep that screen's own file focused on orchestration (coding-standards.md's
 * "small, modular, single-responsibility files") — still owns no state of
 * its own, just renders what the caller's hooks/refs already computed.
 */
import type { ComponentRef } from 'react';
import { Button, Spinner, Text, YStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { FaceCameraView } from '../platform/faceCamera';
import type { LiveFaceInfo } from '../platform/faceCameraTypes';
import type { useLivenessChallenge } from '../platform/livenessSignals';
import { GLASS_PALETTES } from '../theme/glassPalette';
import {
  ALIGNMENT_OVAL_HEIGHT,
  ALIGNMENT_OVAL_WIDTH,
  FaceAlignmentMask,
} from './FaceAlignmentMask';
import { FeedbackBanner } from './FeedbackBanner';
import { LivenessChallengeOverlay } from './LivenessChallengeOverlay';

/** Matches `LoginPunchInScreen`'s own challenge timeout — the overlay's
 * countdown must reflect the same deadline the caller's timeout effect
 * actually enforces, not an independently-guessed duplicate. */
export const FACE_CHALLENGE_TIMEOUT_MS = 15_000;

export interface FaceVerificationCameraProps {
  cameraRef: React.Ref<ComponentRef<typeof FaceCameraView>>;
  hasCameraPermission: boolean;
  requestCameraPermission: () => Promise<boolean>;
  hasDevice: boolean;
  onFrame: (info: LiveFaceInfo) => void;
  onCameraError: (error: Error) => void;
  liveness: ReturnType<typeof useLivenessChallenge>;
  /** Whether the most recent frame was properly framed/frontal-facing —
   * drives the oval guide's color and which instruction copy shows. */
  isFaceAligned: boolean;
  cameraLayoutSize: { width: number; height: number };
  onCameraLayout: (size: { width: number; height: number }) => void;
  isFaceTimedOut: boolean;
  faceAttemptId: number;
  isProcessingFace: boolean;
  faceError: string | null;
  isFacePunchError: boolean;
  facePunchErrorMessage: string | null;
  isFacePunchPaused: boolean;
  /** True once repeated failures (ADR-018) warrant showing extra help,
   * rather than treating every retry as if something's badly wrong. */
  showFallbackGuidance: boolean;
  /** Whether this account/device could actually use fingerprint instead. */
  canSwitchToFingerprint: boolean;
  onRetry: () => void;
  onCancel: () => void;
  onSwitchToFingerprint: () => void;
}

export function FaceVerificationCamera({
  cameraRef,
  hasCameraPermission,
  requestCameraPermission,
  hasDevice,
  onFrame,
  onCameraError,
  liveness,
  isFaceAligned,
  cameraLayoutSize,
  onCameraLayout,
  isFaceTimedOut,
  faceAttemptId,
  isProcessingFace,
  faceError,
  isFacePunchError,
  facePunchErrorMessage,
  isFacePunchPaused,
  showFallbackGuidance,
  canSwitchToFingerprint,
  onRetry,
  onCancel,
  onSwitchToFingerprint,
}: FaceVerificationCameraProps) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];

  if (!hasCameraPermission) {
    return (
      <YStack gap="$2">
        <Text style={{ color: palette.inkSoft }}>We need camera access to verify your face.</Text>
        <Button onPress={requestCameraPermission}>Grant Camera Access</Button>
        <Button onPress={onCancel}>Cancel</Button>
      </YStack>
    );
  }

  if (!hasDevice) {
    return <FeedbackBanner variant="error" message="No front camera was found on this device." />;
  }

  return (
    <YStack gap="$2">
      <YStack
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          onCameraLayout({ width, height });
        }}
        style={{
          height: 320,
          overflow: 'hidden',
          borderRadius: 12,
          position: 'relative',
          borderWidth: 1,
          borderColor: palette.glassBorder,
        }}
      >
        <FaceCameraView ref={cameraRef} onFrame={onFrame} onError={onCameraError} />
        {/* Same guided-oval mask enrollment uses (task 2.7/ADR-018) — turns
            green only once the face is properly sized/centered/frontal,
            giving steering feedback before a blink is even accepted, rather
            than silently accepting a blink from wherever the face happens
            to be in frame (user-reported: a face barely in the corner of
            frame previously still completed the challenge). */}
        <FaceAlignmentMask
          containerWidth={cameraLayoutSize.width}
          containerHeight={cameraLayoutSize.height}
          ovalWidth={ALIGNMENT_OVAL_WIDTH}
          ovalHeight={ALIGNMENT_OVAL_HEIGHT}
          isAligned={isFaceAligned}
          palette={palette}
        />
      </YStack>

      {isFaceTimedOut || isFaceAligned ? (
        <LivenessChallengeOverlay
          key={faceAttemptId}
          type="blink"
          result={liveness.result}
          timedOut={isFaceTimedOut}
          timeoutMs={FACE_CHALLENGE_TIMEOUT_MS}
        />
      ) : (
        <FeedbackBanner
          variant="info"
          message="Align your face inside the oval, facing the camera directly."
        />
      )}

      {isProcessingFace && !isFacePunchPaused ? (
        <YStack gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Spinner />
          <Text style={{ color: palette.inkSoft }}>Verifying...</Text>
        </YStack>
      ) : null}

      {isFacePunchPaused ? (
        <FeedbackBanner
          variant="pending"
          message="You're offline — this punch is queued and will sync automatically once you're back online."
        />
      ) : null}

      {/* Face-capture problems (lost face, closed eyes, blur, poor framing,
          or even a server match miss) are shown as calm "let's try again"
          guidance, never a red error — a first-time user reads a red banner
          as "something is broken," when the fix is simply to re-present their
          face (user-requested #6). The server still re-verifies every attempt
          (ADR-007), so softening the wording changes tone, not security. */}
      {faceError ? <FeedbackBanner variant="info" message={faceError} /> : null}
      {isFacePunchError && facePunchErrorMessage ? (
        <FeedbackBanner
          variant="info"
          message="We couldn't confirm it's you this time. Face the camera in good lighting and try again — or use your fingerprint."
        />
      ) : null}

      {showFallbackGuidance ? (
        <FeedbackBanner
          variant="info"
          message={
            canSwitchToFingerprint
              ? 'Having trouble? You can check in with your fingerprint instead.'
              : 'Having trouble? Make sure your face is well-lit, centered in the frame, and not too far from the camera.'
          }
        />
      ) : null}

      {isFaceTimedOut ? <Button onPress={onRetry}>Try Again</Button> : null}
      {showFallbackGuidance && canSwitchToFingerprint ? (
        <Button onPress={onSwitchToFingerprint}>Use Fingerprint Instead</Button>
      ) : null}
      <Button onPress={onCancel}>Cancel</Button>
    </YStack>
  );
}
