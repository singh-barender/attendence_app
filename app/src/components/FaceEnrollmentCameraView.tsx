/**
 * The live camera preview + capture button for the current angle on
 * `FaceEnrollmentCapture`, split out (coding-standards.md's "small,
 * modular, single-responsibility files").
 */
import type { ComponentRef } from 'react';
import { Button, Text, YStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { FaceCameraView } from '../platform/faceCamera';
import type { LiveFaceInfo } from '../platform/faceCameraTypes';
import { getErrorMessage } from '../services/graphqlError';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { ANGLE_INFO, type Angle } from '../utils/faceAngles';
import { getLiveAlignmentMessage, type LiveAlignmentReason } from '../utils/liveFaceAlignment';
import {
  ALIGNMENT_OVAL_HEIGHT,
  ALIGNMENT_OVAL_WIDTH,
  FaceAlignmentMask,
} from './FaceAlignmentMask';

export interface FaceEnrollmentCameraViewProps {
  nextAngle: Angle;
  frameStats: { count: number; face: LiveFaceInfo };
  cameraRef: React.Ref<ComponentRef<typeof FaceCameraView>>;
  onFrame: (info: LiveFaceInfo) => void;
  onCameraError: (message: string) => void;
  cameraLayoutSize: { width: number; height: number };
  onCameraLayout: (size: { width: number; height: number }) => void;
  isAligned: boolean;
  /** Why the live frame isn't aligned (null once it is, or before the
   * detector has seen a face at all) — drives the specific guidance text
   * below, instead of one generic hint regardless of cause. */
  alignmentReason: LiveAlignmentReason | null;
  onCapture: () => void;
}

/** `no-face` is the ordinary "haven't positioned yet" starting state, not a
 * problem — every other reason reflects something actually wrong with the
 * current frame (covered, closed eyes, a second face, poor framing), shown
 * in red so it reads as a real issue to fix (user-requested). */
function isRealProblem(reason: LiveAlignmentReason | null): boolean {
  return reason !== null && reason !== 'no-face';
}

export function FaceEnrollmentCameraView({
  nextAngle,
  frameStats,
  cameraRef,
  onFrame,
  onCameraError,
  cameraLayoutSize,
  onCameraLayout,
  isAligned,
  alignmentReason,
  onCapture,
}: FaceEnrollmentCameraViewProps) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  const hasProblem = isRealProblem(alignmentReason);

  return (
    <>
      <Text
        style={{
          color: hasProblem ? palette.danger : palette.ink,
          fontWeight: '600',
        }}
      >
        {hasProblem && alignmentReason
          ? getLiveAlignmentMessage(alignmentReason)
          : ANGLE_INFO[nextAngle].instruction}
      </Text>
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
        <FaceCameraView
          ref={cameraRef}
          onFrame={onFrame}
          onError={(err) => onCameraError(getErrorMessage(err, 'Camera error.'))}
        />
        {/* Blurs everything outside the alignment oval's bounding box so
            attention goes to the one region a face needs to sit in, rather
            than an equally-sharp full-frame preview — turns the oval's
            border green once assessLiveAlignment (same size/centering
            thresholds as the post-capture gate, plus a yaw check for the
            requested angle) is satisfied, so the user gets steering feedback
            before tapping Capture instead of only a rejection message after. */}
        <FaceAlignmentMask
          containerWidth={cameraLayoutSize.width}
          containerHeight={cameraLayoutSize.height}
          ovalWidth={ALIGNMENT_OVAL_WIDTH}
          ovalHeight={ALIGNMENT_OVAL_HEIGHT}
          isAligned={isAligned}
          palette={palette}
        />
      </YStack>
      {/* Developer-only frame-pipeline readout (frame count, resolution, face
          presence, eye/yaw signals) — invaluable while debugging the
          detection pipeline on-device, but noise to a real user, so it's
          gated to __DEV__ builds and never ships in production. */}
      {__DEV__ && frameStats.count > 0 ? (
        <Text style={{ color: palette.inkSoft }} fontSize="$1">
          Frame pipeline: {frameStats.count} frames seen ({frameStats.face.frameWidth}x
          {frameStats.face.frameHeight}) — {frameStats.face.hasFace ? '1' : '0'} face(s)
          {frameStats.face.hasFace ? (
            <>
              {' '}
              (eyes: L {frameStats.face.leftEyeOpen?.toFixed(2) ?? '—'} R{' '}
              {frameStats.face.rightEyeOpen?.toFixed(2) ?? '—'}, yaw:{' '}
              {frameStats.face.yawAngle?.toFixed(1) ?? '—'}°)
            </>
          ) : null}
        </Text>
      ) : null}
      <Button
        onPress={onCapture}
        disabled={!isAligned}
        mt="$2"
        style={{ backgroundColor: isAligned ? palette.accent : undefined }}
      >
        <Text style={{ color: isAligned ? palette.accentInk : palette.inkSoft, fontWeight: '700' }}>
          {isAligned ? `Capture ${ANGLE_INFO[nextAngle].label}` : 'Align your face in the frame'}
        </Text>
      </Button>
    </>
  );
}
