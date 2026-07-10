/**
 * Guided left/right/frontal face capture (ADR-006), gated by an enrollment
 * quality check (task 2.7, ADR-018) before a capture is accepted — extracted
 * from Step3FaceEnrollScreen (task 4.2) so registration and profile-screen
 * re-enrollment (`ReEnrollFaceScreen`) share the exact same capture/quality
 * bar rather than a trimmed-down copy for re-enrollment. Owns the camera,
 * quality gate, and embedding computation; the caller owns the actual
 * mutation call and what happens after `onFinish`.
 *
 * `FaceCameraView`'s `capture()` already returns a platform-appropriately-
 * prepared image (native: cropped to face bounds; web: the whole frame,
 * since @vladmandic/human's embedder does its own detection/alignment) plus
 * brightness/sharpness signals, so the quality-gate → embed flow below is
 * identical on both platforms (task 3.8).
 */
import type { ComponentRef, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { Button, Image, Spinner, Text, YStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { FaceCameraView, useFaceCameraPermission } from '../platform/faceCamera';
import type { LiveFaceInfo } from '../platform/faceCameraTypes';
import { faceEmbedder } from '../platform/faceEmbedder';
import { getErrorMessage } from '../services/graphqlError';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { assessEnrollmentQuality } from '../utils/enrollmentQuality';
import { ANGLE_INFO, ANGLES, type Angle } from '../utils/faceAngles';
import { assessLiveAlignment } from '../utils/liveFaceAlignment';
import { FaceAlignmentMask } from './FaceAlignmentMask';
import { FaceAngleHint } from './FaceAngleHint';
import { FeedbackBanner } from './FeedbackBanner';

export interface FaceEnrollmentEmbeddings {
  left: number[];
  right: number[];
  frontal: number[];
}

interface AngleCapture {
  previewUri: string;
  embedding: number[];
}

/**
 * The frame counter is a debug readout, not a data source anything
 * depends on — updating React state on every single camera frame would
 * cause excessive re-renders for no benefit, so JS-side updates are
 * throttled to this interval regardless of how often frames actually arrive.
 */
const FRAME_STATUS_UPDATE_INTERVAL_MS = 500;

/** Alignment-oval bounding box — also the size of the clear "window" left
 * in `FaceAlignmentMask`'s blurred surround, so the two must stay in sync. */
const ALIGNMENT_OVAL_WIDTH = 170;
const ALIGNMENT_OVAL_HEIGHT = 230;

const EMPTY_FACE_INFO: LiveFaceInfo = {
  hasFace: false,
  bounds: null,
  frameWidth: 0,
  frameHeight: 0,
  yawAngle: null,
  leftEyeOpen: null,
  rightEyeOpen: null,
};

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
  const cameraRef = useRef<ComponentRef<typeof FaceCameraView>>(null);
  const [photos, setPhotos] = useState<Partial<Record<Angle, AngleCapture>>>({});
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [cameraLayoutSize, setCameraLayoutSize] = useState({ width: 0, height: 0 });
  const [frameStats, setFrameStats] = useState<{ count: number; face: LiveFaceInfo }>({
    count: 0,
    face: EMPTY_FACE_INFO,
  });
  const totalFramesSeenRef = useRef(0);
  const lastFrameStatusUpdateRef = useRef(0);
  const latestFaceInfoRef = useRef<LiveFaceInfo>(EMPTY_FACE_INFO);

  /**
   * Called on every detected frame by FaceCameraView. `latestFaceInfoRef`
   * is updated unconditionally so the quality gate always reads fresh
   * data at capture time; the debug-readout `setFrameStats` call below it
   * is throttled since re-rendering React state on every frame would be
   * wasteful.
   */
  function handleFrame(info: LiveFaceInfo) {
    totalFramesSeenRef.current += 1;
    latestFaceInfoRef.current = info;

    const now = Date.now();
    if (now - lastFrameStatusUpdateRef.current < FRAME_STATUS_UPDATE_INTERVAL_MS) {
      return;
    }
    lastFrameStatusUpdateRef.current = now;
    setFrameStats({ count: totalFramesSeenRef.current, face: info });
  }

  const nextAngle = ANGLES.find((angle) => !photos[angle]);
  const capturedCount = ANGLES.filter((angle) => photos[angle]).length;

  // Drives the live guide overlay/capture gating below — reuses the same
  // throttled `frameStats` the debug readout already computes, so this
  // adds no extra per-frame state or re-render pressure.
  const isAligned = nextAngle
    ? assessLiveAlignment({
        hasFace: frameStats.face.hasFace,
        faceBounds: frameStats.face.bounds,
        frameWidth: frameStats.face.frameWidth,
        frameHeight: frameStats.face.frameHeight,
        yawAngle: frameStats.face.yawAngle,
        minYawDegrees: ANGLE_INFO[nextAngle].minYaw,
        maxYawDegrees: ANGLE_INFO[nextAngle].maxYaw,
      })
    : false;

  async function handleCapture() {
    if (!nextAngle) {
      return;
    }
    setCaptureError(null);

    try {
      const faceInfo = latestFaceInfoRef.current;
      const captured = await cameraRef.current?.capture();
      if (!captured) {
        return;
      }

      const quality = assessEnrollmentQuality({
        hasFace: faceInfo.hasFace,
        faceBounds: faceInfo.bounds,
        frameWidth: faceInfo.frameWidth,
        frameHeight: faceInfo.frameHeight,
        averageBrightness: captured.averageBrightness,
        sharpnessScore: captured.sharpnessScore,
      });
      if (!quality.accepted || !faceInfo.bounds) {
        setCaptureError(quality.message ?? 'Capture rejected — please try again.');
        return;
      }

      const { embedding } = await faceEmbedder.computeEmbedding(captured.image);
      setPhotos((prev) => ({
        ...prev,
        [nextAngle]: { previewUri: captured.previewUri, embedding },
      }));
    } catch (err) {
      setCaptureError(getErrorMessage(err, 'Failed to capture photo.'));
    }
  }

  function handleRetake(angle: Angle) {
    setPhotos((prev) => {
      const next = { ...prev };
      delete next[angle];
      return next;
    });
  }

  function handleFinish() {
    if (!photos.left || !photos.right || !photos.frontal) {
      return;
    }
    onFinish({
      left: photos.left.embedding,
      right: photos.right.embedding,
      frontal: photos.frontal.embedding,
    });
  }

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
        <>
          <Text style={{ color: palette.ink, fontWeight: '600' }}>
            {ANGLE_INFO[nextAngle].instruction}
          </Text>
          <YStack
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setCameraLayoutSize({ width, height });
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
              onFrame={handleFrame}
              onError={(err) => setCaptureError(getErrorMessage(err, 'Camera error.'))}
            />
            {/* Blurs everything outside the alignment oval's bounding box so
                attention goes to the one region a face needs to sit in,
                rather than an equally-sharp full-frame preview — turns the
                oval's border green once assessLiveAlignment (same size/
                centering thresholds as the post-capture gate, plus a yaw
                check for the requested angle) is satisfied, so the user
                gets steering feedback before tapping Capture instead of
                only a rejection message after. */}
            <FaceAlignmentMask
              containerWidth={cameraLayoutSize.width}
              containerHeight={cameraLayoutSize.height}
              ovalWidth={ALIGNMENT_OVAL_WIDTH}
              ovalHeight={ALIGNMENT_OVAL_HEIGHT}
              isAligned={isAligned}
              palette={palette}
            />
          </YStack>
          {frameStats.count > 0 ? (
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
            onPress={handleCapture}
            disabled={!isAligned}
            mt="$2"
            style={{ backgroundColor: isAligned ? palette.accent : undefined }}
          >
            <Text
              style={{
                color: isAligned ? palette.accentInk : palette.inkSoft,
                fontWeight: '700',
              }}
            >
              {isAligned
                ? `Capture ${ANGLE_INFO[nextAngle].label}`
                : 'Align your face in the frame'}
            </Text>
          </Button>
        </>
      ) : (
        <FeedbackBanner variant="success" message="All three angles captured." />
      )}

      <YStack gap="$2">
        {ANGLES.map((angle) =>
          photos[angle] ? (
            <YStack key={angle} gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Image
                source={{ uri: photos[angle].previewUri }}
                width={60}
                height={60}
                style={{ borderRadius: 8 }}
              />
              <Text style={{ color: palette.ink }} flex={1}>
                {ANGLE_INFO[angle].label}
              </Text>
              <Button size="$2" onPress={() => handleRetake(angle)}>
                Retake
              </Button>
            </YStack>
          ) : null,
        )}
      </YStack>

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
