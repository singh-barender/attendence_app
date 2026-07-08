/**
 * Step 3 of registration (requirements.md) — guided left/right/frontal
 * photo capture via react-native-vision-camera (ADR-006). Real embedding
 * computation and the enrollment quality gate are Phase 2 work (ADR-006,
 * ADR-018); this task captures real photos but submits a placeholder
 * embedding so `registerStep3` (which requires non-null vectors) can be
 * wired end-to-end now — Phase 2 replaces `PLACEHOLDER_EMBEDDING` with the
 * real on-device computed vector, no schema change needed.
 */
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from 'react-native-vision-camera';
import { Button, H1, Image, Spinner, Text, YStack } from 'tamagui';
import { FeedbackBanner } from '../../components/FeedbackBanner';
import { StepProgress } from '../../components/StepProgress';
import { useRegisterStep3Mutation } from '../../generated/graphql';
import type { RootScreenProps } from '../../navigation/types';
import { getErrorMessage } from '../../services/graphqlError';

const PLACEHOLDER_EMBEDDING = [0];

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
    try {
      const file = await photoOutput.capturePhotoToFile({}, {});
      setPhotos((prev) => ({ ...prev, [nextAngle]: file.filePath }));
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
              <Camera style={{ flex: 1 }} device={device} isActive outputs={[photoOutput]} />
            </YStack>
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
