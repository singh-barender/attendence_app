/**
 * The punch-in/out flow (requirements.md, ADR-030) — reached only from the
 * dashboard, by an already-authenticated session (email+password gates
 * *that*; this screen never asks for either). Whichever biometric method
 * succeeds is the actual attendance event, re-verified server-side
 * (ADR-004/ADR-007) — the account itself is recovered from the session
 * token, never typed here.
 *
 * This screen is a thin orchestrator (coding-standards.md's "small, modular,
 * single-responsibility files") — the two biometric flows' state/handlers
 * live in `useFaceVerificationFlow`/`useFingerprintVerification`, account
 * recovery + session-aware routing lives in `useSessionRecovery`, and the
 * "account identified" content is `components/PunchVerificationPanel.tsx`.
 */

import { useQueryClient } from '@tanstack/react-query';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, H1, Text, YStack } from 'tamagui';
import { GlassCard } from '../components/GlassCard';
import { LoadingRow } from '../components/LoadingRow';
import { PunchVerificationPanel } from '../components/PunchVerificationPanel';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { useAttendanceHistoryQuery } from '../generated/graphql';
import { useFaceVerificationFlow } from '../hooks/useFaceVerificationFlow';
import { useFingerprintHardwareStatus } from '../hooks/useFingerprintHardwareStatus';
import { useFingerprintVerification } from '../hooks/useFingerprintVerification';
import { useSessionRecovery } from '../hooks/useSessionRecovery';
import type { RootScreenProps } from '../navigation/types';
import { FINGERPRINT_SUPPORTED } from '../platform/biometric';
import { GLASS_PALETTES } from '../theme/glassPalette';

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

  const { submittedEmail, accountFullName, identify, openSessionDay, isResolvingReopenedSession } =
    useSessionRecovery(navigation, isExplicitCheckout);

  /** Shared post-punch-success steps (invalidating the attendance query so an
   * already-mounted dashboard shows the just-recorded punch, navigating back)
   * — both biometric methods end the same way, so this lives once, passed
   * into each hook, rather than being duplicated inside both. No token to
   * save anymore: punch mutations no longer issue one (a follow-up review
   * finding — the session used to make this request is already valid and
   * untouched, so there's nothing to rotate; see punchIn.ts's header
   * comment). */
  function handlePunchSuccess() {
    void queryClient.invalidateQueries({ queryKey: useAttendanceHistoryQuery.getKey() });
    navigation.navigate('Attendance');
  }

  const fingerprintFlow = useFingerprintVerification(handlePunchSuccess);
  const faceFlow = useFaceVerificationFlow(identify?.userId, handlePunchSuccess);
  const { status: hardwareStatus } = useFingerprintHardwareStatus();

  const canSwitchToFingerprint =
    FINGERPRINT_SUPPORTED && Boolean(identify?.fingerprintEnrolled) && hardwareStatus === 'ready';

  /** Abandons the face path entirely in favor of fingerprint, from the
   * fallback guidance shown after repeated face failures. Composes both
   * hooks' own handlers rather than either hook knowing about the other. */
  function handleSwitchToFingerprint() {
    faceFlow.handleCancelFaceVerification();
    void fingerprintFlow.handleVerifyFingerprint(identify?.userId, accountFullName);
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
              Verify your face or fingerprint to check in or out.
            </Text>

            {submittedEmail === null ? (
              // Always reached authenticated (from the dashboard) — the
              // account is recovered from the session, never typed here, so
              // this only ever shows for the brief moment that recovery takes.
              <LoadingRow message="Preparing verification…" />
            ) : (
              <>
                {isResolvingReopenedSession ? (
                  <LoadingRow message="Restoring your session…" />
                ) : null}

                {identify && !isResolvingReopenedSession ? (
                  <PunchVerificationPanel
                    identify={identify}
                    accountFullName={accountFullName}
                    openSessionCheckInTimestamp={openSessionDay?.checkIn?.timestamp}
                    onContinueRegistration={handleContinueRegistration}
                    hardwareStatus={hardwareStatus}
                    fingerprintFlow={fingerprintFlow}
                    faceFlow={faceFlow}
                    canSwitchToFingerprint={canSwitchToFingerprint}
                    onSwitchToFingerprint={handleSwitchToFingerprint}
                  />
                ) : null}

                {!faceFlow.isFaceCameraActive ? (
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
