/**
 * Step 3 of registration (requirements.md) — guided left/right/frontal
 * photo capture (ADR-006), gated by an enrollment quality check (task 2.7,
 * ADR-018) before a capture is accepted.
 *
 * Task 3.8 extracts this screen's previously-inline
 * react-native-vision-camera + ML Kit frame-processor code into the shared,
 * platform-swappable `platform/faceCamera.native.tsx`/`.web.tsx` (used
 * identically by LoginPunchInScreen) — this screen no longer imports any
 * camera or ML library directly. `FaceCameraView`'s `capture()` already
 * returns a platform-appropriately-prepared image (native: cropped to face
 * bounds; web: the whole frame, since @vladmandic/human's embedder does
 * its own detection/alignment) plus brightness/sharpness signals, so the
 * quality-gate → embed → save flow below is now identical on both
 * platforms.
 *
 * Task 2.7 adds the enrollment quality gate: `handleCapture` measures the
 * capture's brightness/sharpness and combines that with the latest
 * live-frame face bounds (`latestFaceInfoRef`, updated every frame
 * regardless of the debug-readout's own throttling) to judge the capture
 * via `assessEnrollmentQuality` (`utils/enrollmentQuality.ts`) — only once
 * accepted is the embedding computed and the angle recorded.
 */

import type { ComponentRef } from 'react';
import { useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, H1, Image, Spinner, Text, YStack } from 'tamagui';
import { FeedbackBanner } from '../../components/FeedbackBanner';
import { StepProgress } from '../../components/StepProgress';
import { useRegisterStep3Mutation } from '../../generated/graphql';
import type { RootScreenProps } from '../../navigation/types';
import { FaceCameraView, useFaceCameraPermission } from '../../platform/faceCamera';
import type { LiveFaceInfo } from '../../platform/faceCameraTypes';
import { faceEmbedder } from '../../platform/faceEmbedder';
import { getErrorMessage } from '../../services/graphqlError';
import { assessEnrollmentQuality } from '../../utils/enrollmentQuality';
import {
  assessLiveAlignment,
  MAX_FRONTAL_YAW_DEGREES,
  MIN_PROFILE_YAW_DEGREES,
} from '../../utils/liveFaceAlignment';

/** A completed, quality-checked capture for one angle: a displayable
 * preview URI (for the thumbnail) and its computed embedding (submitted
 * at Finish). */
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

const ANGLES = ['left', 'right', 'frontal'] as const;
type Angle = (typeof ANGLES)[number];

/**
 * Per-angle live-guide yaw range — the bound the live yaw must fall within
 * for `assessLiveAlignment` to consider the current angle "aligned".
 * `left`/`right` deliberately leave one side open-ended (`Infinity`): any
 * turn past the minimum still counts as that profile, there's no such
 * thing as "too far turned" for this guide.
 */
const ANGLE_INFO: Record<
  Angle,
  { label: string; instruction: string; minYaw: number; maxYaw: number }
> = {
  left: {
    label: 'Left profile',
    instruction: 'Turn your head slightly to show your left profile',
    minYaw: -Infinity,
    maxYaw: -MIN_PROFILE_YAW_DEGREES,
  },
  right: {
    label: 'Right profile',
    instruction: 'Turn your head slightly to show your right profile',
    minYaw: MIN_PROFILE_YAW_DEGREES,
    maxYaw: Infinity,
  },
  frontal: {
    label: 'Frontal',
    instruction: 'Face the camera directly',
    minYaw: -MAX_FRONTAL_YAW_DEGREES,
    maxYaw: MAX_FRONTAL_YAW_DEGREES,
  },
};

const EMPTY_FACE_INFO: LiveFaceInfo = {
  hasFace: false,
  bounds: null,
  frameWidth: 0,
  frameHeight: 0,
  yawAngle: null,
  leftEyeOpen: null,
  rightEyeOpen: null,
};

export function Step3FaceEnrollScreen({ navigation, route }: RootScreenProps<'RegisterStep3'>) {
  const insets = useSafeAreaInsets();
  const { userId } = route.params;
  const { hasPermission, requestPermission, hasDevice } = useFaceCameraPermission();
  const cameraRef = useRef<ComponentRef<typeof FaceCameraView>>(null);
  const [photos, setPhotos] = useState<Partial<Record<Angle, AngleCapture>>>({});
  const [captureError, setCaptureError] = useState<string | null>(null);
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

  const { mutate, isPending, error, isError } = useRegisterStep3Mutation({
    onSuccess: () => navigation.navigate('Attendance'),
  });

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
    mutate({
      userId,
      embeddings: {
        left: photos.left.embedding,
        right: photos.right.embedding,
        frontal: photos.frontal.embedding,
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

  if (!hasDevice) {
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
            <YStack
              style={{ height: 320, overflow: 'hidden', borderRadius: 8, position: 'relative' }}
            >
              <FaceCameraView ref={cameraRef} onFrame={handleFrame} />
              {/* Real-time framing guide — turns green once assessLiveAlignment
                  (same size/centering thresholds as the post-capture gate,
                  plus a yaw check for the requested angle) is satisfied, so
                  the user gets steering feedback before tapping Capture
                  instead of only a rejection message after. */}
              <YStack
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <YStack
                  borderColor={isAligned ? '$green9' : '$red9'}
                  style={{ width: 170, height: 230, borderRadius: 999, borderWidth: 4 }}
                />
              </YStack>
            </YStack>
            {frameStats.count > 0 ? (
              <Text color="$color10" fontSize="$1">
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
            <Button onPress={handleCapture} disabled={!isAligned} mt="$2">
              {isAligned
                ? `Capture ${ANGLE_INFO[nextAngle].label}`
                : 'Align your face in the frame'}
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
