/**
 * Step 3 of registration (requirements.md) — guided left/right/frontal
 * photo capture via react-native-vision-camera (ADR-006), gated by an
 * enrollment quality check (task 2.7, ADR-018) before a capture is
 * accepted. Real embedding computation is still Phase 2 work (task 2.8);
 * this task captures real, quality-checked photos but submits a placeholder
 * embedding so `registerStep3` (which requires non-null vectors) can be
 * wired end-to-end now — task 2.8 replaces `PLACEHOLDER_EMBEDDING` with the
 * real on-device computed vector, no schema change needed.
 *
 * Task 2.1 adds a real (not stubbed) `useFrameOutput` alongside the existing
 * photo output — the frame pipeline the ML Kit face detector (task 2.2) and
 * the embedder (task 2.4) build on next. `yuv` is used because both ML Kit
 * and LiteRT (the tflite runtime task 2.4 will use) natively consume YUV,
 * per react-native-vision-camera's own guidance — avoids an extra conversion
 * once real per-frame ML work lands.
 *
 * Task 2.2 adds real ML Kit face detection (`useFaceDetector().detectFaces`)
 * inside that same per-frame worklet, rather than a second `CameraOutput` —
 * one frame pipeline doing one detection pass, not two independent ones
 * competing for the same frames. `runClassifications: true` is enabled now
 * (not deferred) since it's what task 2.5/2.6's liveness blink-detection
 * needs (`leftEyeOpenProbability`/`rightEyeOpenProbability`) — a concrete,
 * already-decided near-term need (ADR-018), not speculative. `pitchAngle`/
 * `rollAngle`/`yawAngle` and `bounds` are always present on a detected
 * `Face`, no flag needed. The on-screen debug readout exists to make "real
 * ML Kit data is actually flowing on this device" independently verifiable,
 * not just assumed from a compile.
 *
 * Task 2.7 adds the enrollment quality gate: `handleCapture` now captures an
 * in-memory `Photo` (not straight to a file), measures its brightness/
 * sharpness (`imageQualitySignals.native.ts`) and combines that with the
 * latest live-frame face bounds (`latestFaceInfoRef`, updated every frame
 * regardless of the debug-readout's own throttling) to judge the capture via
 * `assessEnrollmentQuality` (`packages/liveness`'s sibling pure-logic
 * package for this concern, `utils/enrollmentQuality.ts`) — only once
 * accepted is the photo saved to a file and added to `photos`.
 */

import { useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  CommonResolutions,
  useCameraDevice,
  useCameraPermission,
  useFrameOutput,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { scheduleOnRN } from 'react-native-worklets';
import { Button, H1, Image, Spinner, Text, YStack } from 'tamagui';
import { FeedbackBanner } from '../../components/FeedbackBanner';
import { StepProgress } from '../../components/StepProgress';
import { useRegisterStep3Mutation } from '../../generated/graphql';
import type { RootScreenProps } from '../../navigation/types';
import { measureImageQuality } from '../../platform/imageQualitySignals.native';
import { getErrorMessage } from '../../services/graphqlError';
import type { FaceBounds } from '../../utils/enrollmentQuality';
import { assessEnrollmentQuality } from '../../utils/enrollmentQuality';

const PLACEHOLDER_EMBEDDING = [0];

/**
 * The frame/face counters are a debug readout, not a data source anything
 * depends on — updating React state on every single camera frame (30-60/sec)
 * would cause excessive re-renders for no benefit, so JS-side updates are
 * throttled to this interval regardless of how often frames actually arrive.
 */
const FRAME_STATUS_UPDATE_INTERVAL_MS = 500;

/** Minimal per-frame face summary for the debug readout — task 2.5's
 * liveness work reads its own fields directly off `Face` itself. */
interface FaceDebugSummary {
  count: number;
  leftEyeOpen: number | null;
  rightEyeOpen: number | null;
  yawAngle: number | null;
  bounds: FaceBounds | null;
}

/**
 * The most recent live frame's face presence/bounds/dimensions, updated on
 * every frame (not just the throttled debug-readout state) so the quality
 * gate always judges against fresh data at the exact moment of capture, not
 * a value that's up to FRAME_STATUS_UPDATE_INTERVAL_MS stale.
 */
interface LatestFaceInfo {
  hasFace: boolean;
  bounds: FaceBounds | null;
  frameWidth: number;
  frameHeight: number;
}

const ANGLES = ['left', 'right', 'frontal'] as const;
type Angle = (typeof ANGLES)[number];

const ANGLE_INFO: Record<Angle, { label: string; instruction: string }> = {
  left: { label: 'Left profile', instruction: 'Turn your head slightly to show your left profile' },
  right: {
    label: 'Right profile',
    instruction: 'Turn your head slightly to show your right profile',
  },
  frontal: { label: 'Frontal', instruction: 'Face the camera directly' },
};

export function Step3FaceEnrollScreen({ navigation, route }: RootScreenProps<'RegisterStep3'>) {
  const insets = useSafeAreaInsets();
  const { userId } = route.params;
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const photoOutput = usePhotoOutput();
  const [photos, setPhotos] = useState<Partial<Record<Angle, string>>>({});
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [frameStats, setFrameStats] = useState<{
    count: number;
    width: number;
    height: number;
    face: FaceDebugSummary | null;
  }>({ count: 0, width: 0, height: 0, face: null });
  const totalFramesSeenRef = useRef(0);
  const lastFrameStatusUpdateRef = useRef(0);
  const latestFaceInfoRef = useRef<LatestFaceInfo>({
    hasFace: false,
    bounds: null,
    frameWidth: 0,
    frameHeight: 0,
  });

  const faceDetector = useFaceDetector({ performanceMode: 'fast', runClassifications: true });

  /**
   * Runs on the RN/JS thread (scheduled from the frame-output worklet below)
   * for every frame. `latestFaceInfoRef` is updated unconditionally so the
   * quality gate (task 2.7) always reads fresh data at capture time; the
   * debug-readout `setFrameStats` call below it is throttled since
   * re-rendering React state on every frame would be wasteful.
   */
  function recordFrameSeen(width: number, height: number, face: FaceDebugSummary | null) {
    totalFramesSeenRef.current += 1;
    latestFaceInfoRef.current = {
      hasFace: (face?.count ?? 0) > 0,
      bounds: face?.bounds ?? null,
      frameWidth: width,
      frameHeight: height,
    };

    const now = Date.now();
    if (now - lastFrameStatusUpdateRef.current < FRAME_STATUS_UPDATE_INTERVAL_MS) {
      return;
    }
    lastFrameStatusUpdateRef.current = now;
    setFrameStats({ count: totalFramesSeenRef.current, width, height, face });
  }

  const frameOutput = useFrameOutput({
    // coding-standards.md's Performance section requires downscaling frames
    // before inference (task 2.A audit) — neither ML Kit face detection nor
    // the 112x112 MobileFaceNet embedder (task 2.4) benefit from full sensor
    // resolution, so VGA_4_3 (480x640, matching the front camera's portrait
    // aspect ratio) is requested instead of the sensor's native ~1280x720+.
    targetResolution: CommonResolutions.VGA_4_3,
    pixelFormat: 'yuv',
    onFrame(frame) {
      'worklet';
      const faces = faceDetector.detectFaces(frame);
      const firstFace = faces[0];
      const faceSummary: FaceDebugSummary | null = firstFace
        ? {
            count: faces.length,
            leftEyeOpen: firstFace.leftEyeOpenProbability ?? null,
            rightEyeOpen: firstFace.rightEyeOpenProbability ?? null,
            yawAngle: firstFace.yawAngle,
            bounds: firstFace.bounds,
          }
        : { count: 0, leftEyeOpen: null, rightEyeOpen: null, yawAngle: null, bounds: null };
      scheduleOnRN(recordFrameSeen, frame.width, frame.height, faceSummary);
      frame.dispose();
    },
  });

  const { mutate, isPending, error, isError } = useRegisterStep3Mutation({
    onSuccess: () => navigation.navigate('Attendance'),
  });

  const nextAngle = ANGLES.find((angle) => !photos[angle]);
  const capturedCount = ANGLES.filter((angle) => photos[angle]).length;

  async function handleCapture() {
    if (!nextAngle) {
      return;
    }
    setCaptureError(null);

    let photo: Awaited<ReturnType<typeof photoOutput.capturePhoto>> | undefined;
    try {
      photo = await photoOutput.capturePhoto({}, {});

      const { averageBrightness, sharpnessScore } = measureImageQuality(photo.toImage());
      const quality = assessEnrollmentQuality({
        hasFace: latestFaceInfoRef.current.hasFace,
        faceBounds: latestFaceInfoRef.current.bounds,
        frameWidth: latestFaceInfoRef.current.frameWidth,
        frameHeight: latestFaceInfoRef.current.frameHeight,
        averageBrightness,
        sharpnessScore,
      });
      if (!quality.accepted) {
        setCaptureError(quality.message);
        return;
      }

      const filePath = await photo.saveToTemporaryFileAsync();
      setPhotos((prev) => ({ ...prev, [nextAngle]: filePath }));
    } catch (err) {
      setCaptureError(getErrorMessage(err, 'Failed to capture photo.'));
    } finally {
      photo?.dispose();
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
    mutate({
      userId,
      embeddings: {
        left: PLACEHOLDER_EMBEDDING,
        right: PLACEHOLDER_EMBEDDING,
        frontal: PLACEHOLDER_EMBEDDING,
      },
    });
  }

  if (!hasPermission) {
    return (
      <YStack
        flex={1}
        gap="$4"
        p="$4"
        background="$background"
        style={{ justifyContent: 'center' }}
      >
        <H1>Face Enrollment</H1>
        <StepProgress step={3} total={3} label="Face enrollment" />
        <Text color="$color10">
          We need camera access to capture your left, right, and frontal profile photos.
        </Text>
        <Button onPress={requestPermission}>Grant Camera Access</Button>
      </YStack>
    );
  }

  if (!device) {
    return (
      <YStack flex={1} p="$4" background="$background" style={{ justifyContent: 'center' }}>
        <FeedbackBanner variant="error" message="No front camera was found on this device." />
      </YStack>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <YStack flex={1} gap="$4" p="$4" background="$background">
        <H1>Face Enrollment</H1>
        <StepProgress step={3} total={3} label="Face enrollment" />
        <Text color="$color10">
          Capture three angles so we can recognize you at check-in: left profile, right profile, and
          a straight-on frontal shot ({capturedCount} of {ANGLES.length} captured).
        </Text>

        {nextAngle ? (
          <>
            <Text color="$color" fontWeight="600">
              {ANGLE_INFO[nextAngle].instruction}
            </Text>
            <YStack style={{ height: 320, overflow: 'hidden', borderRadius: 8 }}>
              <Camera
                style={{ flex: 1 }}
                device={device}
                isActive
                outputs={[photoOutput, frameOutput]}
              />
            </YStack>
            {frameStats.count > 0 ? (
              <Text color="$color10" fontSize="$1">
                Frame pipeline: {frameStats.count} frames seen ({frameStats.width}x
                {frameStats.height}) — {frameStats.face?.count ?? 0} face(s)
                {frameStats.face?.count ? (
                  <>
                    {' '}
                    (eyes: L {frameStats.face.leftEyeOpen?.toFixed(2) ?? '—'} R{' '}
                    {frameStats.face.rightEyeOpen?.toFixed(2) ?? '—'}, yaw:{' '}
                    {frameStats.face.yawAngle?.toFixed(1) ?? '—'}°)
                  </>
                ) : null}
              </Text>
            ) : null}
            <Button onPress={handleCapture} mt="$2">
              Capture {ANGLE_INFO[nextAngle].label}
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
                  source={{ uri: `file://${photos[angle]}` }}
                  width={60}
                  height={60}
                  style={{ borderRadius: 8 }}
                />
                <Text color="$color" flex={1}>
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
        {isError ? <FeedbackBanner variant="error" message={getErrorMessage(error)} /> : null}

        {!nextAngle ? (
          <Button
            onPress={handleFinish}
            disabled={isPending}
            {...(isPending ? { icon: <Spinner /> } : {})}
          >
            {isPending ? 'Finishing...' : 'Finish registration'}
          </Button>
        ) : null}
        <YStack style={{ height: insets.bottom }} />
      </YStack>
    </ScrollView>
  );
}
