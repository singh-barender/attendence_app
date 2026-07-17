/**
 * Guided left/right/frontal face capture (ADR-006), gated by an enrollment
 * quality check (task 2.7, ADR-018) before a capture is accepted — used by
 * both registration and profile-screen re-enrollment (`ReEnrollFaceScreen`)
 * so they share the exact same capture/quality bar rather than a
 * trimmed-down copy. Owns the camera, quality gate, and embedding
 * computation; the caller owns the actual mutation call and what happens
 * after `onFinish`.
 *
 * This component is a thin orchestrator (coding-standards.md's "small,
 * modular, single-responsibility files") — state/handlers live in
 * `useFaceEnrollmentCapture`, the live camera view is
 * `FaceEnrollmentCameraView`, and the captured-thumbnails list is
 * `CapturedAnglesList`.
 */
import type { ReactNode } from 'react';
import { Button, Spinner, Text, YStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import type { FaceEnrollmentEmbeddings } from '../hooks/useFaceEnrollmentCapture';
import { useFaceEnrollmentCapture } from '../hooks/useFaceEnrollmentCapture';
import { useFaceCameraPermission } from '../platform/faceCamera';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { ANGLES } from '../utils/faceAngles';
import { CapturedAnglesList } from './CapturedAnglesList';
import { FaceAngleHint } from './FaceAngleHint';
import { FaceEnrollmentCameraView } from './FaceEnrollmentCameraView';
import { FeedbackBanner } from './FeedbackBanner';

export type { FaceEnrollmentEmbeddings };

interface FaceEnrollmentCaptureProps {
  /** Called once all three angles are captured and the user taps Finish —
   * the caller owns the actual mutation call and post-success navigation. */
  onFinish: (embeddings: FaceEnrollmentEmbeddings) => void;
  isSubmitting: boolean;
  submitError: string | null;
  finishLabel: string;
  finishingLabel: string;
  /** Optional slot rendered above the capture UI (e.g. StepProgress during
   * registration) — omitted entirely for re-enrollment. */
  progress?: ReactNode;
}

export function FaceEnrollmentCapture({
  onFinish,
  isSubmitting,
  submitError,
  finishLabel,
  finishingLabel,
  progress,
}: FaceEnrollmentCaptureProps) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  const { hasPermission, requestPermission, hasDevice } = useFaceCameraPermission();
  const {
    cameraRef,
    photos,
    captureError,
    setCaptureError,
    cameraLayoutSize,
    setCameraLayoutSize,
    frameStats,
    nextAngle,
    capturedCount,
    isAligned,
    handleFrame,
    handleCapture,
    handleRetake,
    handleFinish,
  } = useFaceEnrollmentCapture(onFinish);

  if (!hasPermission) {
    return (
      <YStack gap="$4">
        {progress}
        <FaceAngleHint />
        <Text style={{ color: palette.inkSoft }}>
          We need camera access to capture your left, right, and frontal profile photos.
        </Text>
        <Button onPress={requestPermission} size="$4" style={{ backgroundColor: palette.accent }}>
          <Text style={{ color: palette.accentInk, fontWeight: '700', letterSpacing: 1 }}>
            GRANT CAMERA ACCESS
          </Text>
        </Button>
      </YStack>
    );
  }

  if (!hasDevice) {
    return (
      <YStack gap="$4">
        {progress}
        <FeedbackBanner variant="error" message="No front camera was found on this device." />
      </YStack>
    );
  }

  return (
    <YStack gap="$4">
      {progress}
      <Text style={{ color: palette.inkSoft }}>
        Capture three angles so we can recognize you at check-in: left profile, right profile, and a
        straight-on frontal shot ({capturedCount} of {ANGLES.length} captured).
      </Text>

      {nextAngle ? (
        <FaceEnrollmentCameraView
          nextAngle={nextAngle}
          frameStats={frameStats}
          cameraRef={cameraRef}
          onFrame={handleFrame}
          onCameraError={setCaptureError}
          cameraLayoutSize={cameraLayoutSize}
          onCameraLayout={setCameraLayoutSize}
          isAligned={isAligned}
          onCapture={handleCapture}
        />
      ) : (
        <FeedbackBanner variant="success" message="All three angles captured." />
      )}

      <CapturedAnglesList photos={photos} onRetake={handleRetake} />

      {captureError ? <FeedbackBanner variant="error" message={captureError} /> : null}
      {submitError ? <FeedbackBanner variant="error" message={submitError} /> : null}

      {!nextAngle ? (
        <Button
          onPress={handleFinish}
          disabled={isSubmitting}
          style={{ backgroundColor: palette.accent }}
          {...(isSubmitting ? { icon: <Spinner /> } : {})}
        >
          <Text style={{ color: palette.accentInk, fontWeight: '700', letterSpacing: 1 }}>
            {(isSubmitting ? finishingLabel : finishLabel).toUpperCase()}
          </Text>
        </Button>
      ) : null}
    </YStack>
  );
}
