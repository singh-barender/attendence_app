/**
 * The login/punch-in flow (requirements.md) — these are the same action,
 * not two separate steps. Email identifies the account (no password, ever);
 * whichever biometric method succeeds *is* the login *and* the punch event.
 *
 * Task 2.9 adds the real face path (fingerprint has been real since Phase
 * 1): tapping "Verify Face" starts the same camera + ML Kit frame pipeline
 * used in Step3FaceEnrollScreen (tasks 2.1/2.2), drives a liveness challenge
 * (`useLivenessChallenge('blink')`, task 2.6) via `LivenessChallengeOverlay`,
 * and only once a blink is detected does it capture a photo, crop to the
 * live-frame face bounds (`utils/faceCrop.ts`, task 2.8's same aspect-ratio
 * trick between `frameOutput`'s VGA_4_3 and `photoOutput`'s HD_4_3), and
 * compute a live embedding via `faceEmbedder.native.ts`.
 *
 * There is deliberately **no local match** against the user's enrolled
 * embeddings here — `identify` only ever returns booleans
 * (`faceEnrolled`/`fingerprintEnrolled`), never raw embedding vectors, since
 * exposing enrolled biometric data to any caller who knows a valid email
 * (pre-verification) would be a real exposure. The "optimistic" part of
 * architecture.md's "local embedding -> local optimistic match" is UX
 * framing only: an immediate "Verifying..." state right after the live
 * embedding is computed, while `punchInFace`'s server-side re-verification
 * (ADR-007 — the actual security boundary, task 2.9/2.11) is what actually
 * decides success or failure.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import { useEffect, useRef, useState } from 'react';
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
import type { Face } from 'react-native-vision-camera-face-detector';
import { useFaceDetector } from 'react-native-vision-camera-face-detector';
import { scheduleOnRN } from 'react-native-worklets';
import { Button, H1, Input, Spinner, Text, YStack } from 'tamagui';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { LivenessChallengeOverlay } from '../components/LivenessChallengeOverlay';
import {
  useIdentifyQuery,
  usePunchInFaceMutation,
  usePunchInFingerprintMutation,
} from '../generated/graphql';
import { useFingerprintHardwareStatus } from '../hooks/useFingerprintHardwareStatus';
import type { RootScreenProps } from '../navigation/types';
import { nativeFaceEmbedder } from '../platform/faceEmbedder.native';
import { useLivenessChallenge } from '../platform/livenessSignals.native';
import { setAuthToken } from '../services/graphqlClient';
import { getErrorMessage } from '../services/graphqlError';
import { saveToken } from '../services/tokenStorage.native';
import type { FaceBounds } from '../utils/enrollmentQuality';
import { mapFaceBoundsToCropRect } from '../utils/faceCrop';
import { getFingerprintAuthErrorMessage } from '../utils/fingerprintAuthErrors';
import { getBestEffortLocation } from '../utils/geolocation';
import { isValidEmail } from '../utils/validation';

/**
 * How long the camera waits for a completed blink before giving up. Task
 * 2.10 adds the fingerprint-fallback/guidance UX on top of this; this task
 * just stops the challenge from waiting forever.
 */
const FACE_CHALLENGE_TIMEOUT_MS = 15_000;

/** The most recent live frame's face presence/bounds/dimensions — mirrors
 * Step3FaceEnrollScreen's own `LatestFaceInfo` (task 2.7/2.8). */
interface LatestFaceInfo {
  hasFace: boolean;
  bounds: FaceBounds | null;
  frameWidth: number;
  frameHeight: number;
}

export function LoginPunchInScreen({ navigation }: RootScreenProps<'Login'>) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const [isFaceCameraActive, setIsFaceCameraActive] = useState(false);
  const [faceAttemptId, setFaceAttemptId] = useState(0);
  const [faceError, setFaceError] = useState<string | null>(null);
  const [isFaceTimedOut, setIsFaceTimedOut] = useState(false);
  const [isProcessingFace, setIsProcessingFace] = useState(false);
  const faceCaptureTriggeredRef = useRef(false);
  const latestFaceInfoRef = useRef<LatestFaceInfo>({
    hasFace: false,
    bounds: null,
    frameWidth: 0,
    frameHeight: 0,
  });

  const { hasPermission: hasCameraPermission, requestPermission: requestCameraPermission } =
    useCameraPermission();
  const device = useCameraDevice('front');
  const photoOutput = usePhotoOutput({
    // Same aspect-ratio-matching trick as Step3FaceEnrollScreen (task 2.8):
    // frameOutput's VGA_4_3 and this HD_4_3 share an aspect ratio so
    // utils/faceCrop.ts's fractional bounds mapping is valid.
    targetResolution: CommonResolutions.HD_4_3,
  });
  const faceDetector = useFaceDetector({ performanceMode: 'fast', runClassifications: true });
  const liveness = useLivenessChallenge('blink');

  const { status: hardwareStatus } = useFingerprintHardwareStatus();

  const {
    data: identifyData,
    isLoading: isIdentifying,
    isError: isIdentifyError,
    error: identifyError,
  } = useIdentifyQuery({ email: submittedEmail ?? '' }, { enabled: submittedEmail !== null });

  const identify = identifyData?.identify;

  const {
    mutate: punchInFingerprint,
    isPending: isPunchingInFingerprint,
    isError: isFingerprintPunchError,
    error: fingerprintPunchError,
  } = usePunchInFingerprintMutation({
    onSuccess: async (data) => {
      const token = data.punchInFingerprint?.token;
      if (token) {
        await saveToken(token);
        setAuthToken(token);
      }
      navigation.navigate('Attendance');
    },
  });

  const {
    mutate: punchInFace,
    isPending: isPunchingInFace,
    isError: isFacePunchError,
    error: facePunchError,
  } = usePunchInFaceMutation({
    onSuccess: async (data) => {
      const token = data.punchInFace?.token;
      if (token) {
        await saveToken(token);
        setAuthToken(token);
      }
      navigation.navigate('Attendance');
    },
    onError: () => {
      // The server rejected the match (or another error) — let the user
      // retry the challenge rather than being stuck on a dead camera view.
      resetFaceChallenge();
    },
  });

  function handleContinue() {
    if (!isValidEmail(email)) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailError(null);
    setSubmittedEmail(email.trim());
  }

  function handleUseDifferentEmail() {
    setSubmittedEmail(null);
    setAuthError(null);
    setIsFaceCameraActive(false);
    resetFaceChallenge();
  }

  async function handleVerifyFingerprint() {
    if (!identify?.userId) {
      return;
    }
    setAuthError(null);
    setIsVerifying(true);
    try {
      const location = await getBestEffortLocation();
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Verify to check in as ${identify.fullName ?? 'yourself'}`,
      });
      if (!result.success) {
        setAuthError(getFingerprintAuthErrorMessage(result.error));
        return;
      }
      punchInFingerprint({
        userId: identify.userId,
        latitude: location?.latitude,
        longitude: location?.longitude,
      });
    } finally {
      setIsVerifying(false);
    }
  }

  function resetFaceChallenge() {
    faceCaptureTriggeredRef.current = false;
    setIsFaceTimedOut(false);
    setFaceError(null);
    setIsProcessingFace(false);
    liveness.reset();
    setFaceAttemptId((id) => id + 1);
  }

  function handleStartFaceVerification() {
    resetFaceChallenge();
    setIsFaceCameraActive(true);
  }

  function handleCancelFaceVerification() {
    setIsFaceCameraActive(false);
    resetFaceChallenge();
  }

  /** Runs on the RN/JS thread for every frame — mirrors Step3FaceEnrollScreen's
   * own recordFrameSeen (task 2.6/2.7), minus the debug-readout throttling
   * this screen doesn't need. */
  function recordFrameSeen(
    width: number,
    height: number,
    face: {
      count: number;
      leftEyeOpen: number | null;
      rightEyeOpen: number | null;
      yawAngle: number | null;
      bounds: FaceBounds | null;
    } | null,
  ) {
    latestFaceInfoRef.current = {
      hasFace: (face?.count ?? 0) > 0,
      bounds: face?.bounds ?? null,
      frameWidth: width,
      frameHeight: height,
    };

    const timestampMs = Date.now();
    const mlKitFace = face?.count
      ? ({
          leftEyeOpenProbability: face.leftEyeOpen,
          rightEyeOpenProbability: face.rightEyeOpen,
          yawAngle: face.yawAngle,
        } as unknown as Face)
      : undefined;
    liveness.recordFrame(mlKitFace, timestampMs);
  }

  const frameOutput = useFrameOutput({
    targetResolution: CommonResolutions.VGA_4_3,
    pixelFormat: 'yuv',
    onFrame(frame) {
      'worklet';
      const faces = faceDetector.detectFaces(frame);
      const firstFace = faces[0];
      const faceSummary = firstFace
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

  async function handleFaceCapture() {
    if (!identify?.userId) {
      return;
    }
    setIsProcessingFace(true);
    setFaceError(null);

    let photo: Awaited<ReturnType<typeof photoOutput.capturePhoto>> | undefined;
    try {
      photo = await photoOutput.capturePhoto({}, {});
      const faceInfo = latestFaceInfoRef.current;
      if (!faceInfo.hasFace || !faceInfo.bounds) {
        setFaceError('We lost sight of your face — try again.');
        resetFaceChallenge();
        return;
      }

      const image = photo.toImage();
      const cropRect = mapFaceBoundsToCropRect(
        faceInfo.bounds,
        faceInfo.frameWidth,
        faceInfo.frameHeight,
        image.width,
        image.height,
      );
      const faceCrop = image.crop(cropRect.startX, cropRect.startY, cropRect.endX, cropRect.endY);
      const { embedding } = await nativeFaceEmbedder.computeEmbedding(faceCrop);

      const location = await getBestEffortLocation();
      punchInFace({
        userId: identify.userId,
        embedding: [...embedding],
        latitude: location?.latitude,
        longitude: location?.longitude,
      });
    } catch (err) {
      setFaceError(getErrorMessage(err, 'Face verification failed.'));
      resetFaceChallenge();
    } finally {
      photo?.dispose();
      setIsProcessingFace(false);
    }
  }

  // Once the liveness challenge completes, capture + embed + submit exactly
  // once per attempt (faceCaptureTriggeredRef guards against re-firing on
  // every subsequent frame while liveness.result stays "detected"). This
  // intentionally excludes handleFaceCapture from its deps — it's redefined
  // every render (not memoized), and the ref guard above already prevents
  // firing more than once per attempt, so depending on it would only force
  // redundant re-runs without changing behavior.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    if (!isFaceCameraActive || !liveness.result.detected || faceCaptureTriggeredRef.current) {
      return;
    }
    faceCaptureTriggeredRef.current = true;
    void handleFaceCapture();
  }, [liveness.result, isFaceCameraActive]);

  // Times the challenge out rather than waiting forever for a blink that
  // never comes (e.g. camera pointed away) — task 2.10 builds the
  // fingerprint-fallback guidance on top of this timeout. faceAttemptId isn't
  // read in the effect body, but it's the deliberate mechanism for
  // restarting the timer when "Try Again" fires while isFaceCameraActive was
  // already true (that boolean alone wouldn't change value in that case).
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    if (!isFaceCameraActive) {
      return;
    }
    const timer = setTimeout(() => setIsFaceTimedOut(true), FACE_CHALLENGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isFaceCameraActive, faceAttemptId]);

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <YStack flex={1} gap="$4" p="$4" background="$background">
        <H1>Attendance</H1>
        <Text color="$color10">
          Enter your email, then verify your face or fingerprint — that verification is your
          check-in or check-out. No password, ever.
        </Text>

        {submittedEmail === null ? (
          <>
            <Input
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setEmailError(null);
              }}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              returnKeyType="go"
              onSubmitEditing={handleContinue}
            />
            {emailError ? <FeedbackBanner variant="error" message={emailError} /> : null}
            <Button onPress={handleContinue}>Continue</Button>
          </>
        ) : (
          <>
            {isIdentifying ? (
              <YStack gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Spinner />
                <Text color="$color10">Looking up your account...</Text>
              </YStack>
            ) : null}

            {isIdentifyError ? (
              <FeedbackBanner variant="error" message={getErrorMessage(identifyError)} />
            ) : null}

            {identify ? (
              <>
                <FeedbackBanner variant="success" message={`Welcome back, ${identify.fullName}.`} />

                {!identify.fingerprintEnrolled && !identify.faceEnrolled ? (
                  <FeedbackBanner
                    variant="info"
                    message="No biometric method is set up for this account yet. Finish registration to enable check-in."
                  />
                ) : null}

                {identify.fingerprintEnrolled && hardwareStatus === 'no-hardware' ? (
                  <FeedbackBanner
                    variant="error"
                    message="This device has no biometric hardware. Fingerprint check-in isn't available here."
                  />
                ) : null}

                {identify.fingerprintEnrolled && hardwareStatus === 'not-enrolled' ? (
                  <FeedbackBanner
                    variant="error"
                    message="No fingerprint is enrolled on this device. Enroll one in Settings, then retry."
                  />
                ) : null}

                {authError ? <FeedbackBanner variant="error" message={authError} /> : null}
                {isFingerprintPunchError ? (
                  <FeedbackBanner
                    variant="error"
                    message={getErrorMessage(fingerprintPunchError)}
                  />
                ) : null}

                {identify.faceEnrolled && isFaceCameraActive ? (
                  <FaceVerificationCamera
                    hasCameraPermission={hasCameraPermission}
                    requestCameraPermission={requestCameraPermission}
                    device={device}
                    photoOutput={photoOutput}
                    frameOutput={frameOutput}
                    liveness={liveness}
                    isFaceTimedOut={isFaceTimedOut}
                    isProcessingFace={isProcessingFace || isPunchingInFace}
                    faceError={faceError}
                    isFacePunchError={isFacePunchError}
                    facePunchErrorMessage={
                      isFacePunchError ? getErrorMessage(facePunchError) : null
                    }
                    onRetry={handleStartFaceVerification}
                    onCancel={handleCancelFaceVerification}
                  />
                ) : null}

                {identify.faceEnrolled && !isFaceCameraActive ? (
                  <Button onPress={handleStartFaceVerification}>Verify Face</Button>
                ) : null}

                {identify.fingerprintEnrolled &&
                hardwareStatus === 'ready' &&
                !isFaceCameraActive ? (
                  <Button
                    onPress={handleVerifyFingerprint}
                    disabled={isVerifying || isPunchingInFingerprint}
                    {...(isVerifying || isPunchingInFingerprint ? { icon: <Spinner /> } : {})}
                  >
                    {isPunchingInFingerprint ? 'Recording punch...' : 'Verify Fingerprint'}
                  </Button>
                ) : null}
              </>
            ) : null}

            {!isFaceCameraActive ? (
              <Button onPress={handleUseDifferentEmail}>Use a different email</Button>
            ) : null}
          </>
        )}
        <YStack style={{ height: insets.bottom }} />
      </YStack>
    </ScrollView>
  );
}

interface FaceVerificationCameraProps {
  hasCameraPermission: boolean;
  requestCameraPermission: () => Promise<boolean>;
  device: ReturnType<typeof useCameraDevice>;
  photoOutput: ReturnType<typeof usePhotoOutput>;
  frameOutput: ReturnType<typeof useFrameOutput>;
  liveness: ReturnType<typeof useLivenessChallenge>;
  isFaceTimedOut: boolean;
  isProcessingFace: boolean;
  faceError: string | null;
  isFacePunchError: boolean;
  facePunchErrorMessage: string | null;
  onRetry: () => void;
  onCancel: () => void;
}

/**
 * The face-verification camera view, split out of `LoginPunchInScreen` only
 * to keep that component's JSX readable — still owns no state of its own,
 * just renders what the parent's hooks/refs already computed.
 */
function FaceVerificationCamera({
  hasCameraPermission,
  requestCameraPermission,
  device,
  photoOutput,
  frameOutput,
  liveness,
  isFaceTimedOut,
  isProcessingFace,
  faceError,
  isFacePunchError,
  facePunchErrorMessage,
  onRetry,
  onCancel,
}: FaceVerificationCameraProps) {
  if (!hasCameraPermission) {
    return (
      <YStack gap="$2">
        <Text color="$color10">We need camera access to verify your face.</Text>
        <Button onPress={requestCameraPermission}>Grant Camera Access</Button>
        <Button onPress={onCancel}>Cancel</Button>
      </YStack>
    );
  }

  if (!device) {
    return <FeedbackBanner variant="error" message="No front camera was found on this device." />;
  }

  return (
    <YStack gap="$2">
      <YStack style={{ height: 320, overflow: 'hidden', borderRadius: 8 }}>
        <Camera style={{ flex: 1 }} device={device} isActive outputs={[photoOutput, frameOutput]} />
      </YStack>

      <LivenessChallengeOverlay type="blink" result={liveness.result} timedOut={isFaceTimedOut} />

      {isProcessingFace ? (
        <YStack gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Spinner />
          <Text color="$color10">Verifying...</Text>
        </YStack>
      ) : null}

      {faceError ? <FeedbackBanner variant="error" message={faceError} /> : null}
      {isFacePunchError && facePunchErrorMessage ? (
        <FeedbackBanner variant="error" message={facePunchErrorMessage} />
      ) : null}

      {isFaceTimedOut ? <Button onPress={onRetry}>Try Again</Button> : null}
      <Button onPress={onCancel}>Cancel</Button>
    </YStack>
  );
}
