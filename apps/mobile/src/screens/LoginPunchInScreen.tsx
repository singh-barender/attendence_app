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

import type { LivenessChallengeType } from '@attendance-app/liveness';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import type { ComponentRef } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, H1, Spinner, Text, YStack } from 'tamagui';
import {
  ALIGNMENT_OVAL_HEIGHT,
  ALIGNMENT_OVAL_WIDTH,
  FaceAlignmentMask,
} from '../components/FaceAlignmentMask';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { GlassCard } from '../components/GlassCard';
import { LivenessChallengeOverlay } from '../components/LivenessChallengeOverlay';
import { SessionTimer } from '../components/SessionTimer';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import {
  useAttendanceHistoryQuery,
  useIdentifyQuery,
  useMeQuery,
  usePunchInFaceMutation,
  usePunchInFingerprintMutation,
} from '../generated/graphql';
import { useFingerprintHardwareStatus } from '../hooks/useFingerprintHardwareStatus';
import type { RootScreenProps } from '../navigation/types';
import { FINGERPRINT_SUPPORTED } from '../platform/biometric';
import { FaceCameraView, useFaceCameraPermission } from '../platform/faceCamera';
import { FRAME_STATE_THROTTLE_MS, type LiveFaceInfo } from '../platform/faceCameraTypes';
import { faceEmbedder } from '../platform/faceEmbedder';
import { useLivenessChallenge } from '../platform/livenessSignals';
import { setAuthToken } from '../services/graphqlClient';
import { getErrorMessage } from '../services/graphqlError';
import { loadToken, saveToken } from '../services/tokenStorage';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { assessEnrollmentQuality } from '../utils/enrollmentQuality';
import { ANGLE_INFO } from '../utils/faceAngles';
import { getFingerprintAuthErrorMessage } from '../utils/fingerprintAuthErrors';
import { getPunchLocation } from '../utils/geolocation';
import { assessLiveAlignment } from '../utils/liveFaceAlignment';

/** How long the camera waits for a completed blink before giving up. */
const FACE_CHALLENGE_TIMEOUT_MS = 15_000;

/**
 * Liveness challenges verification randomizes over. Deliberately only the
 * blink family: both require a real open→closed→open eye transition, so a
 * static photo can't satisfy them (a single-frame smile-probability check
 * could), AND both leave the face frontal for the capture that fires the
 * instant the challenge passes — head-turn/nod would end with the head
 * turned/pitched, which both strands the user (the frontal frame gate filters
 * out the very turned frames those detectors need) and yields a poor
 * off-angle capture. `blink-twice` adds variety an observer can't predict.
 * Wiring the motion challenges in needs a capture-after-challenge flow rework
 * plus on-device verification — tracked as a follow-up, not used here yet.
 */
const VERIFICATION_CHALLENGES: readonly LivenessChallengeType[] = ['blink', 'blink-twice'];

/** Failed face attempts (timeout, lost-face, or server rejection) before
 * offering the fingerprint fallback / extra guidance (ADR-018). */
const FACE_FALLBACK_THRESHOLD = 2;

const EMPTY_FACE_INFO: LiveFaceInfo = {
  hasFace: false,
  faceCount: 0,
  bounds: null,
  frameWidth: 0,
  frameHeight: 0,
  yawAngle: null,
  leftEyeOpen: null,
  rightEyeOpen: null,
  smileProbability: null,
  pitchAngle: null,
  isOccluded: false,
};

export function LoginPunchInScreen({ navigation, route }: RootScreenProps<'Punch'>) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  /** This screen is only ever reached authenticated, from the dashboard, to
   * record a punch — so the account is recovered from the session (`me`),
   * never entered by hand, and it never redirects back to the dashboard on
   * its own (the user came *from* there to punch). `intent` selects the
   * check-in vs check-out framing. */
  const isExplicitCheckout = route.params.intent === 'checkout';
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  /** Session-aware routing (user-requested): `null` while still checking
   * storage, then whether a session token was found. Gates the auto-login
   * bootstrap below — set directly from `loadToken()` here rather than
   * relying on App.tsx's own startup `loadToken`/`setAuthToken` call having
   * already finished (no ordering guarantee between the two), calling
   * `setAuthToken` again here too so the header is set regardless of which
   * effect actually wins the race. */
  const [hasStoredToken, setHasStoredToken] = useState<boolean | null>(null);

  /** True once the account was recovered from the saved token (a cold
   * app-reopen), as opposed to the user typing an email by hand. Only this
   * path redirects an open session to the dashboard (part of the
   * "reopen lands on the dashboard, not forced checkout" ask) — a
   * hand-typed email that happens to have an open session still shows the
   * verify view here. */
  const [didAutoRecover, setDidAutoRecover] = useState(false);

  useEffect(() => {
    loadToken().then((token) => {
      if (token) {
        setAuthToken(token);
      }
      setHasStoredToken(Boolean(token));
    });
  }, []);

  const [isFaceCameraActive, setIsFaceCameraActive] = useState(false);
  const [faceAttemptId, setFaceAttemptId] = useState(0);
  const [faceError, setFaceError] = useState<string | null>(null);
  const [isFaceTimedOut, setIsFaceTimedOut] = useState(false);
  const [isProcessingFace, setIsProcessingFace] = useState(false);
  const [faceFailureCount, setFaceFailureCount] = useState(0);
  /** Whether the *most recent* frame had a properly-framed, frontal-facing
   * face (user-requested, ADR-018-safe: reuses the exact same
   * `assessLiveAlignment` size/centering/yaw signal `FaceEnrollmentCapture`
   * already uses, no new ML). Drives both the oval guide's color and, more
   * importantly, gates which frames are allowed to count toward the blink
   * challenge below — without this gate, a face barely visible at the edge
   * of frame (only an eye showing) could still satisfy `detectBlink`, which
   * looks purely at eye-open-probability transitions with no framing check
   * of its own. */
  const [isFaceAligned, setIsFaceAligned] = useState(false);
  const [cameraLayoutSize, setCameraLayoutSize] = useState({ width: 0, height: 0 });
  const lastAlignmentUpdateRef = useRef(0);
  const faceCaptureTriggeredRef = useRef(false);
  const latestFaceInfoRef = useRef<LiveFaceInfo>(EMPTY_FACE_INFO);
  const cameraRef = useRef<ComponentRef<typeof FaceCameraView>>(null);

  const {
    hasPermission: hasCameraPermission,
    requestPermission: requestCameraPermission,
    hasDevice,
  } = useFaceCameraPermission();
  const [challengeType, setChallengeType] = useState<LivenessChallengeType>('blink');

  const randomizeChallenge = useCallback(() => {
    setChallengeType(
      VERIFICATION_CHALLENGES[Math.floor(Math.random() * VERIFICATION_CHALLENGES.length)] ??
        'blink',
    );
  }, []);

  useEffect(() => {
    randomizeChallenge();
  }, [randomizeChallenge]);

  const liveness = useLivenessChallenge(challengeType);

  const { status: hardwareStatus } = useFingerprintHardwareStatus();

  /** Auto-login (user-requested "remember my session" ask, ADR-004-safe:
   * this only recovers *which account* to identify, skipping the manual
   * email-entry step — it never skips the actual biometric re-verification
   * a punch still requires). `hasAttemptedAutoLoginRef` makes this strictly
   * one-shot per mount: without it, tapping "use a different email" would
   * reset `submittedEmail` to null, which would just re-enable this query
   * and immediately re-submit the same remembered email, making "use a
   * different email" impossible to actually act on. A failed/unauthorized
   * `me` (expired or cleared token) just leaves the screen on its normal
   * manual-entry state. */
  const hasAttemptedAutoLoginRef = useRef(false);
  const { data: meData, isFetched: isMeFetched } = useMeQuery(undefined, {
    enabled: hasStoredToken === true,
  });

  // submittedEmail is intentionally excluded: this must only react to the
  // `me` fetch settling, never re-run just because submittedEmail changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    if (!isMeFetched || hasAttemptedAutoLoginRef.current) {
      return;
    }
    hasAttemptedAutoLoginRef.current = true;
    if (meData?.me?.email && submittedEmail === null) {
      setDidAutoRecover(true);
      setSubmittedEmail(meData.me.email);
    }
  }, [isMeFetched, meData]);

  const {
    data: identifyData,
    isLoading: isIdentifying,
    isError: isIdentifyError,
    error: identifyError,
  } = useIdentifyQuery({ email: submittedEmail ?? '' }, { enabled: submittedEmail !== null });

  const identify = identifyData?.identify;

  /** Today's open (checked-in, not checked-out) session, if any — drives
   * the live `SessionTimer` and disabling "use a different email" below.
   * Searching for `status === 'OPEN'` rather than computing "today" on the
   * client is deliberate: only the actual server-side today's row can ever
   * be OPEN (part B), so this needs no separate date computation that could
   * drift from the server's own notion of "today". */
  const { data: attendanceHistoryData, isFetched: isHistoryFetched } = useAttendanceHistoryQuery(
    undefined,
    { enabled: Boolean(identify) },
  );
  const openSessionDay = attendanceHistoryData?.attendanceHistory?.find(
    (day) => day.status === 'OPEN',
  );

  /** On a cold app-reopen with a still-open session, send the user to the
   * dashboard (which shows the live timer and a "Verify to check out"
   * button) rather than dropping them straight onto the checkout verify view
   * — the user found the latter "forcefully" gating the dashboard behind a
   * checkout. Redirects exactly once, and never when the screen was opened
   * *for* checkout (`isExplicitCheckout`) or when the email was typed by hand
   * (`didAutoRecover` is false), both of which legitimately want the verify
   * view here. `replace` (not `navigate`) so back doesn't return to this
   * transient login screen. */
  const hasRedirectedToDashboardRef = useRef(false);
  useEffect(() => {
    if (isExplicitCheckout || !didAutoRecover || hasRedirectedToDashboardRef.current) {
      return;
    }
    if (openSessionDay) {
      hasRedirectedToDashboardRef.current = true;
      navigation.replace('Attendance');
    }
  }, [isExplicitCheckout, didAutoRecover, openSessionDay, navigation]);

  /** While an auto-recovered session is still resolving whether today is
   * open, hold back the verify view: if it turns out open we're about to
   * redirect to the dashboard, and flashing the checkout verify view for
   * that split second would reproduce the exact "forced straight to
   * checkout" behavior this routing removes. Doesn't apply to explicit
   * checkout or hand-typed check-in, which both want the verify view. */
  const isResolvingReopenedSession =
    didAutoRecover && !isExplicitCheckout && Boolean(identify) && !isHistoryFetched;
  /** Registration isn't done until Step 3 (`registrationStep === 3`) — an
   * account mid-wizard shouldn't be offered "Verify Face"/"Verify
   * Fingerprint" alongside "Continue Registration" at the same time (a
   * confusing multi-button state); only one CTA makes sense at once. */
  const isRegistrationComplete = (identify?.registrationStep ?? 3) >= 3;

  const {
    mutate: punchInFingerprint,
    isPending: isPunchingInFingerprint,
    isPaused: isFingerprintPunchPaused,
    isError: isFingerprintPunchError,
    error: fingerprintPunchError,
  } = usePunchInFingerprintMutation({
    onSuccess: async (data) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const token = data.punchInFingerprint?.token;
      if (token) {
        await saveToken(token);
        setAuthToken(token);
      }
      // A punch changes today's row; invalidate so the dashboard (which may
      // already be mounted below this screen and thus won't refetch on its
      // own when we pop back to it) shows the just-recorded check-out.
      void queryClient.invalidateQueries({ queryKey: useAttendanceHistoryQuery.getKey() });
      navigation.navigate('Attendance');
    },
    onError: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  const {
    mutate: punchInFace,
    isPending: isPunchingInFace,
    isPaused: isFacePunchPaused,
    isError: isFacePunchError,
    error: facePunchError,
  } = usePunchInFaceMutation({
    onSuccess: async (data) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const token = data.punchInFace?.token;
      if (token) {
        await saveToken(token);
        setAuthToken(token);
      }
      // See the fingerprint punch's onSuccess: keep the dashboard in sync
      // with the just-recorded check-out even when we pop back to an
      // already-mounted Attendance screen.
      void queryClient.invalidateQueries({ queryKey: useAttendanceHistoryQuery.getKey() });
      navigation.navigate('Attendance');
    },
    onError: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // The server rejected the match (or another error) — let the user
      // retry the challenge rather than being stuck on a dead camera view.
      handleFaceFailure();
    },
  });

  async function handleVerifyFingerprint() {
    if (!identify?.userId) {
      return;
    }
    setAuthError(null);
    setIsVerifying(true);
    try {
      const location = await getPunchLocation();
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Verify to check in as ${identify.fullName ?? 'yourself'}`,
      });
      if (!result.success) {
        setAuthError(getFingerprintAuthErrorMessage(result.error));
        return;
      }
      punchInFingerprint({
        userId: identify.userId,
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
      });
    } finally {
      setIsVerifying(false);
    }
  }

  /** Sends an account with an unfinished registration wizard (`registrationStep`
   * < 3) back into it at the right step — without this, an account that
   * dropped off after Step 1/2 has no way back in, and that email is
   * permanently stuck (registerStep1 rejects re-registering an existing
   * email, ADR-004). */
  function handleContinueRegistration() {
    if (!identify?.userId) {
      return;
    }
    // `submittedEmail` is this account's own email (it's what identified it),
    // carried into the wizard so its final step can hand it back to check-in.
    const accountEmail = submittedEmail ?? '';
    if ((identify.registrationStep ?? 3) <= 1) {
      navigation.navigate('RegisterStep2', { userId: identify.userId, email: accountEmail });
      return;
    }
    navigation.navigate('RegisterStep3', { userId: identify.userId, email: accountEmail });
  }

  /** Resets challenge state to try again, without touching the failure count. */
  function resetFaceChallenge() {
    faceCaptureTriggeredRef.current = false;
    setIsFaceTimedOut(false);
    setFaceError(null);
    setIsProcessingFace(false);
    setIsFaceAligned(false);
    liveness.reset();
    randomizeChallenge();
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

  /**
   * Called on every detected frame by FaceCameraView. Frames only count
   * toward the blink challenge (`liveness.recordFrame`) while properly
   * aligned — `assessLiveAlignment` is the same presence/size/centering/yaw
   * check `FaceEnrollmentCapture` uses to gate its Capture button, applied
   * here against the frontal-facing range (`ANGLE_INFO.frontal`) since
   * verification, unlike enrollment, only ever asks for one angle. The
   * alignment decision itself is computed fresh on every frame (so a
   * misaligned frame can never sneak into the challenge window); only the
   * `isFaceAligned` *state* that drives the oval's color is throttled, same
   * cadence as enrollment's own debug readout, to avoid a render per frame.
   */
  function handleFrame(info: LiveFaceInfo) {
    latestFaceInfoRef.current = info;
    const aligned = assessLiveAlignment({
      hasFace: info.hasFace,
      faceCount: info.faceCount,
      faceBounds: info.bounds,
      frameWidth: info.frameWidth,
      frameHeight: info.frameHeight,
      yawAngle: info.yawAngle,
      minYawDegrees: ANGLE_INFO.frontal.minYaw,
      maxYawDegrees: ANGLE_INFO.frontal.maxYaw,
      isOccluded: info.isOccluded,
    });
    if (aligned) {
      liveness.recordFrame(info, Date.now());
    }

    // Only the alignment *state* that colors the oval is throttled (a render
    // per frame would be wasteful). `faceError` is deliberately NOT touched
    // here: it's for capture/verification failures (set by handleFaceFailure,
    // cleared on retry), kept separate from live guidance. Occlusion, a
    // misframe, closed eyes, or a second face all make `aligned` false, which
    // reddens the oval and shows the "align your face" hint on its own — no
    // per-frame error text needed.
    const now = Date.now();
    if (now - lastAlignmentUpdateRef.current >= FRAME_STATE_THROTTLE_MS) {
      lastAlignmentUpdateRef.current = now;
      setIsFaceAligned(aligned);
    }
  }

  /**
   * Captures + submits only once the frame at the moment of capture also
   * passes the same quality bar enrollment requires (`assessEnrollmentQuality`
   * — presence, exposure, focus, framing, evaluated against the just-captured
   * photo's own brightness/sharpness, not just the live preview's). The
   * alignment gate above already keeps obviously-bad frames out of the blink
   * window, but a user can still drift out of frame in the instant between
   * the blink completing and this capture actually running — this is the
   * last-moment check that closes that gap rather than trusting the blink
   * alone to mean "this was a good capture".
   */
  async function handleFaceCapture() {
    if (!identify?.userId) {
      return;
    }
    setIsProcessingFace(true);
    setFaceError(null);

    try {
      const faceInfo = latestFaceInfoRef.current;
      const captured = await cameraRef.current?.capture();
      if (!captured) {
        handleFaceFailure('We lost sight of your face — try again.');
        return;
      }

      const quality = assessEnrollmentQuality({
        hasFace: faceInfo.hasFace,
        faceCount: faceInfo.faceCount,
        faceBounds: faceInfo.bounds,
        frameWidth: faceInfo.frameWidth,
        frameHeight: faceInfo.frameHeight,
        averageBrightness: captured.averageBrightness,
        sharpnessScore: captured.sharpnessScore,
        leftEyeOpen: faceInfo.leftEyeOpen,
        rightEyeOpen: faceInfo.rightEyeOpen,
        isOccluded: faceInfo.isOccluded,
      });
      if (!quality.accepted) {
        handleFaceFailure(quality.message ?? 'Capture rejected — please try again.');
        return;
      }

      const { embedding } = await faceEmbedder.computeEmbedding(captured.image);

      const location = await getPunchLocation();
      punchInFace({
        userId: identify.userId,
        embedding: [...embedding],
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
      });
    } catch (err) {
      handleFaceFailure(
        getErrorMessage(err, "Let's try that again — hold steady and face the camera."),
      );
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
      <YStack
        flex={1}
        style={{ justifyContent: 'center', alignItems: 'center' }}
        px="$2"
        py="$4"
        pb={insets.bottom + 16}
      >
        <YStack width="100%" style={{ maxWidth: 440 }}>
          <GlassCard p="$6" gap="$4">
            <H1 style={{ textAlign: 'center', color: palette.ink }} mb="$2">
              Attendance App
            </H1>
            <Text style={{ textAlign: 'center', color: palette.inkSoft }} mb="$4">
              Enter your email to securely check in or out.
            </Text>

            {submittedEmail === null ? (
              // Always reached authenticated (from the dashboard) — the
              // account is recovered from the session, never typed here, so
              // this only ever shows for the brief moment that recovery takes.
              <YStack
                gap="$2"
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
              >
                <Spinner />
                <Text style={{ color: palette.inkSoft }}>Preparing verification…</Text>
              </YStack>
            ) : (
              <>
                {isResolvingReopenedSession ? (
                  <YStack
                    gap="$2"
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Spinner />
                    <Text style={{ color: palette.inkSoft }}>Restoring your session…</Text>
                  </YStack>
                ) : null}

                {isIdentifying ? (
                  <YStack
                    gap="$2"
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Spinner />
                    <Text style={{ color: palette.inkSoft }}>Looking up your account...</Text>
                  </YStack>
                ) : null}

                {isIdentifyError ? (
                  <FeedbackBanner variant="error" message={getErrorMessage(identifyError)} />
                ) : null}

                {identify && !isResolvingReopenedSession ? (
                  <>
                    <FeedbackBanner
                      variant="success"
                      message={`Welcome back, ${identify.fullName}.`}
                    />

                    {openSessionDay?.checkIn?.timestamp ? (
                      <SessionTimer checkInTimestamp={openSessionDay.checkIn.timestamp} />
                    ) : null}

                    {(identify.registrationStep ?? 3) < 3 ? (
                      <>
                        <FeedbackBanner
                          variant="info"
                          message="Registration isn't finished yet — continue where you left off to enable check-in."
                        />
                        <Button
                          size="$4"
                          onPress={handleContinueRegistration}
                          style={{ backgroundColor: palette.accent }}
                        >
                          <Text
                            style={{
                              color: palette.accentInk,
                              fontWeight: '700',
                              letterSpacing: 1,
                            }}
                          >
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

                        {authError ? <FeedbackBanner variant="error" message={authError} /> : null}
                        {isFingerprintPunchPaused ? (
                          <FeedbackBanner
                            variant="pending"
                            message="You're offline — this punch is queued and will sync automatically once you're back online."
                          />
                        ) : null}
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
                              handleFaceFailure(
                                getErrorMessage(
                                  err,
                                  'The camera paused for a moment — please try again.',
                                ),
                              )
                            }
                            liveness={liveness}
                            isFaceAligned={isFaceAligned}
                            cameraLayoutSize={cameraLayoutSize}
                            onCameraLayout={setCameraLayoutSize}
                            isFaceTimedOut={isFaceTimedOut}
                            faceAttemptId={faceAttemptId}
                            isProcessingFace={isProcessingFace || isPunchingInFace}
                            faceError={faceError}
                            isFacePunchError={isFacePunchError}
                            facePunchErrorMessage={
                              isFacePunchError ? getErrorMessage(facePunchError) : null
                            }
                            isFacePunchPaused={isFacePunchPaused}
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
                          <Button
                            onPress={handleStartFaceVerification}
                            size="$4"
                            style={{ backgroundColor: palette.accent }}
                          >
                            <Text
                              style={{
                                color: palette.accentInk,
                                fontWeight: '700',
                                letterSpacing: 1,
                              }}
                            >
                              {openSessionDay ? 'VERIFY FACE TO CHECK OUT' : 'VERIFY FACE'}
                            </Text>
                          </Button>
                        ) : null}

                        {FINGERPRINT_SUPPORTED &&
                        identify.fingerprintEnrolled &&
                        hardwareStatus === 'ready' &&
                        !isFaceCameraActive ? (
                          <Button
                            onPress={handleVerifyFingerprint}
                            disabled={isVerifying || isPunchingInFingerprint}
                            size="$4"
                            style={{ backgroundColor: palette.accent }}
                            {...(isVerifying ||
                            (isPunchingInFingerprint && !isFingerprintPunchPaused)
                              ? { icon: <Spinner /> }
                              : {})}
                          >
                            <Text
                              style={{
                                color: palette.accentInk,
                                fontWeight: '700',
                                letterSpacing: 1,
                              }}
                            >
                              {isFingerprintPunchPaused
                                ? 'QUEUED — WILL SYNC'
                                : isPunchingInFingerprint
                                  ? 'RECORDING PUNCH...'
                                  : openSessionDay
                                    ? 'VERIFY FINGERPRINT TO CHECK OUT'
                                    : 'VERIFY FINGERPRINT'}
                            </Text>
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                  </>
                ) : null}

                {!isFaceCameraActive ? (
                  // This is a punch, launched from the dashboard — the way out
                  // is simply to go back without punching, not to switch
                  // accounts (that's a logout on the dashboard/profile).
                  <Button
                    onPress={() => navigation.navigate('Attendance')}
                    variant="outlined"
                    size="$4"
                  >
                    <Text style={{ color: palette.ink, letterSpacing: 1 }}>CANCEL</Text>
                  </Button>
                ) : null}
              </>
            )}
          </GlassCard>
        </YStack>
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
