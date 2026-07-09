/**
 * The login/punch-in flow (requirements.md) — these are the same action,
 * not two separate steps. Email identifies the account (no password, ever);
 * whichever biometric method succeeds *is* the login *and* the punch event.
 *
 * Task 2.9 adds the real face path (fingerprint has been real since Phase
 * 1): tapping "Verify Face" starts the camera, drives a liveness challenge
 * (`useLivenessChallenge('blink')`, task 2.6) via `LivenessChallengeOverlay`,
 * and only once a blink is detected does it capture + compute a live
 * embedding.
 *
 * Task 3.8 extracts the previously-inline react-native-vision-camera + ML
 * Kit frame-processor code into the shared, platform-swappable
 * `platform/faceCamera.native.tsx`/`.web.tsx` (used identically by
 * Step3FaceEnrollScreen) — this screen no longer imports any camera or ML
 * library directly, and its liveness recording now runs against the same
 * neutral `LiveFaceInfo` shape regardless of platform.
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
 *
 * Task 2.10 adds retry/fallback UX: every failure (challenge timeout,
 * losing sight of the face mid-capture, or a server-rejected match) bumps
 * `faceFailureCount`; once it reaches `FACE_FALLBACK_THRESHOLD` the camera
 * view adds either a "Use Fingerprint Instead" button (if this account/
 * device supports it) or more specific lighting/positioning guidance —
 * never both, and only after repeated failures, so a single ordinary retry
 * isn't treated as if something's badly wrong.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import type { ComponentRef } from 'react';
import { useEffect, useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { FINGERPRINT_SUPPORTED } from '../platform/biometric';
import { FaceCameraView, useFaceCameraPermission } from '../platform/faceCamera';
import type { LiveFaceInfo } from '../platform/faceCameraTypes';
import { faceEmbedder } from '../platform/faceEmbedder';
import { useLivenessChallenge } from '../platform/livenessSignals';
import { setAuthToken } from '../services/graphqlClient';
import { getErrorMessage } from '../services/graphqlError';
import { saveToken } from '../services/tokenStorage';
import { getFingerprintAuthErrorMessage } from '../utils/fingerprintAuthErrors';
import { getBestEffortLocation } from '../utils/geolocation';
import { isValidEmail } from '../utils/validation';

/** How long the camera waits for a completed blink before giving up. */
const FACE_CHALLENGE_TIMEOUT_MS = 15_000;

/** Failed face attempts (timeout, lost-face, or server rejection) before
 * offering the fingerprint fallback / extra guidance (ADR-018). */
const FACE_FALLBACK_THRESHOLD = 2;

const EMPTY_FACE_INFO: LiveFaceInfo = {
  hasFace: false,
  bounds: null,
  frameWidth: 0,
  frameHeight: 0,
  yawAngle: null,
  leftEyeOpen: null,
  rightEyeOpen: null,
};

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
  const [faceFailureCount, setFaceFailureCount] = useState(0);
  const faceCaptureTriggeredRef = useRef(false);
  const latestFaceInfoRef = useRef<LiveFaceInfo>(EMPTY_FACE_INFO);
  const cameraRef = useRef<ComponentRef<typeof FaceCameraView>>(null);

  const {
    hasPermission: hasCameraPermission,
    requestPermission: requestCameraPermission,
    hasDevice,
  } = useFaceCameraPermission();
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
      handleFaceFailure();
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

  /** Resets challenge state to try again, without touching the failure count. */
  function resetFaceChallenge() {
    faceCaptureTriggeredRef.current = false;
    setIsFaceTimedOut(false);
    setFaceError(null);
    setIsProcessingFace(false);
    liveness.reset();
    setFaceAttemptId((id) => id + 1);
  }

  /** A failed attempt (lost-face mid-capture, or server rejection) — counts
   * toward the fallback threshold, then immediately resets so the camera
   * keeps running and the user can try again without an extra tap.
   * `message` (if given) is applied *after* the reset, since resetFaceChallenge
   * itself clears faceError — setting it before would just be wiped out. */
  function handleFaceFailure(message?: string) {
    setFaceFailureCount((count) => count + 1);
    resetFaceChallenge();
    if (message) {
      setFaceError(message);
    }
  }

  /** The "Try Again" button after a timeout — the failure was already
   * counted when the timeout fired (see the timeout effect below), so this
   * only resets the challenge state, it doesn't count a second failure. */
  function handleRetryAfterTimeout() {
    resetFaceChallenge();
  }

  /** A fresh start (the "Verify Face" button) — the user is starting over,
   * not continuing a failure streak, so the count clears. */
  function handleStartFaceVerification() {
    setFaceFailureCount(0);
    resetFaceChallenge();
    setIsFaceCameraActive(true);
  }

  function handleCancelFaceVerification() {
    setIsFaceCameraActive(false);
    setFaceFailureCount(0);
    resetFaceChallenge();
  }

  /** Abandons the face path entirely in favor of fingerprint, from the
   * fallback guidance shown after repeated face failures. */
  function handleSwitchToFingerprint() {
    handleCancelFaceVerification();
    void handleVerifyFingerprint();
  }

  /** Called on every detected frame by FaceCameraView. */
  function handleFrame(info: LiveFaceInfo) {
    latestFaceInfoRef.current = info;
    liveness.recordFrame(info, Date.now());
  }

  async function handleFaceCapture() {
    if (!identify?.userId) {
      return;
    }
    setIsProcessingFace(true);
    setFaceError(null);

    try {
      const faceInfo = latestFaceInfoRef.current;
      if (!faceInfo.hasFace || !faceInfo.bounds) {
        handleFaceFailure('We lost sight of your face — try again.');
        return;
      }

      const captured = await cameraRef.current?.capture();
      if (!captured) {
        handleFaceFailure('We lost sight of your face — try again.');
        return;
      }
      const { embedding } = await faceEmbedder.computeEmbedding(captured.image);

      const location = await getBestEffortLocation();
      punchInFace({
        userId: identify.userId,
        embedding: [...embedding],
        latitude: location?.latitude,
        longitude: location?.longitude,
      });
    } catch (err) {
      handleFaceFailure(getErrorMessage(err, 'Face verification failed.'));
    } finally {
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
  // never comes (e.g. camera pointed away). Counts toward the fallback
  // threshold immediately when it fires (not deferred until "Try Again" is
  // tapped) — the failed attempt already happened at that point. faceAttemptId
  // isn't read in the effect body, but it's the deliberate mechanism for
  // restarting the timer when "Try Again" fires while isFaceCameraActive was
  // already true (that boolean alone wouldn't change value in that case).
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    if (!isFaceCameraActive) {
      return;
    }
    const timer = setTimeout(() => {
      setIsFaceTimedOut(true);
      setFaceFailureCount((count) => count + 1);
    }, FACE_CHALLENGE_TIMEOUT_MS);
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

                {authError ? <FeedbackBanner variant="error" message={authError} /> : null}
                {isFingerprintPunchError ? (
                  <FeedbackBanner
                    variant="error"
                    message={getErrorMessage(fingerprintPunchError)}
                  />
                ) : null}

                {identify.faceEnrolled && isFaceCameraActive ? (
                  <FaceVerificationCamera
                    cameraRef={cameraRef}
                    hasCameraPermission={hasCameraPermission}
                    requestCameraPermission={requestCameraPermission}
                    hasDevice={hasDevice}
                    onFrame={handleFrame}
                    onCameraError={(err) =>
                      handleFaceFailure(getErrorMessage(err, 'Camera error.'))
                    }
                    liveness={liveness}
                    isFaceTimedOut={isFaceTimedOut}
                    isProcessingFace={isProcessingFace || isPunchingInFace}
                    faceError={faceError}
                    isFacePunchError={isFacePunchError}
                    facePunchErrorMessage={
                      isFacePunchError ? getErrorMessage(facePunchError) : null
                    }
                    showFallbackGuidance={faceFailureCount >= FACE_FALLBACK_THRESHOLD}
                    canSwitchToFingerprint={
                      FINGERPRINT_SUPPORTED &&
                      Boolean(identify.fingerprintEnrolled) &&
                      hardwareStatus === 'ready'
                    }
                    onRetry={handleRetryAfterTimeout}
                    onCancel={handleCancelFaceVerification}
                    onSwitchToFingerprint={handleSwitchToFingerprint}
                  />
                ) : null}

                {identify.faceEnrolled && !isFaceCameraActive ? (
                  <Button onPress={handleStartFaceVerification}>Verify Face</Button>
                ) : null}

                {FINGERPRINT_SUPPORTED &&
                identify.fingerprintEnrolled &&
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
  cameraRef: React.Ref<ComponentRef<typeof FaceCameraView>>;
  hasCameraPermission: boolean;
  requestCameraPermission: () => Promise<boolean>;
  hasDevice: boolean;
  onFrame: (info: LiveFaceInfo) => void;
  onCameraError: (error: Error) => void;
  liveness: ReturnType<typeof useLivenessChallenge>;
  isFaceTimedOut: boolean;
  isProcessingFace: boolean;
  faceError: string | null;
  isFacePunchError: boolean;
  facePunchErrorMessage: string | null;
  /** True once repeated failures (ADR-018) warrant showing extra help,
   * rather than treating every retry as if something's badly wrong. */
  showFallbackGuidance: boolean;
  /** Whether this account/device could actually use fingerprint instead. */
  canSwitchToFingerprint: boolean;
  onRetry: () => void;
  onCancel: () => void;
  onSwitchToFingerprint: () => void;
}

/**
 * The face-verification camera view, split out of `LoginPunchInScreen` only
 * to keep that component's JSX readable — still owns no state of its own,
 * just renders what the parent's hooks/refs already computed.
 */
function FaceVerificationCamera({
  cameraRef,
  hasCameraPermission,
  requestCameraPermission,
  hasDevice,
  onFrame,
  onCameraError,
  liveness,
  isFaceTimedOut,
  isProcessingFace,
  faceError,
  isFacePunchError,
  facePunchErrorMessage,
  showFallbackGuidance,
  canSwitchToFingerprint,
  onRetry,
  onCancel,
  onSwitchToFingerprint,
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

  if (!hasDevice) {
    return <FeedbackBanner variant="error" message="No front camera was found on this device." />;
  }

  return (
    <YStack gap="$2">
      <YStack style={{ height: 320, overflow: 'hidden', borderRadius: 8 }}>
        <FaceCameraView ref={cameraRef} onFrame={onFrame} onError={onCameraError} />
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
