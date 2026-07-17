/**
 * Fingerprint verification + punch, split out of `LoginPunchInScreen`
 * (coding-standards.md's "small, modular, single-responsibility files") — a
 * self-contained unit: on-device biometric prompt, then the punch mutation,
 * with its own loading/error state. `onPunchSuccess` is the one thing the
 * caller still owns (invalidating the attendance query, navigating) since
 * `useFaceVerificationFlow`'s punch mutation needs the exact same
 * post-success steps — sharing one callback keeps that logic in a single
 * place rather than duplicated across both hooks. Takes no arguments — punch
 * mutations no longer return a session token (a follow-up review finding:
 * the caller's existing session is already valid throughout a punch, so
 * there is nothing left to rotate — see punchIn.ts's header comment).
 */
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { useState } from 'react';
import { usePunchInFingerprintMutation } from '../generated/graphql';
import { getFingerprintAuthErrorMessage } from '../utils/fingerprintAuthErrors';
import { getPunchLocation } from '../utils/geolocation';
import { generateIdempotencyKey } from '../utils/idempotencyKey';

export function useFingerprintVerification(onPunchSuccess: () => void) {
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const {
    mutate: punchInFingerprint,
    isPending: isPunchingInFingerprint,
    isPaused: isFingerprintPunchPaused,
    isError: isFingerprintPunchError,
    error: fingerprintPunchError,
  } = usePunchInFingerprintMutation({
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onPunchSuccess();
    },
    onError: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    },
  });

  async function handleVerifyFingerprint(
    userId: string | null | undefined,
    fullName: string | null | undefined,
  ) {
    if (!userId) {
      return;
    }
    setAuthError(null);
    setIsVerifying(true);
    try {
      const location = await getPunchLocation();
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Verify to check in as ${fullName ?? 'yourself'}`,
      });
      if (!result.success) {
        setAuthError(getFingerprintAuthErrorMessage(result.error));
        return;
      }
      punchInFingerprint({
        userId,
        // See useFaceVerificationFlow.ts's matching comment (F7) — a fresh
        // key per attempt, offline-resume reuses it automatically.
        idempotencyKey: generateIdempotencyKey(),
        // Captured now — the moment the biometric attempt actually
        // succeeded — not whenever this mutation eventually reaches the
        // server. A follow-up review finding: without this, a punch queued
        // offline and resumed after local midnight got bucketed to the
        // wrong day server-side (see punchIn.ts's header comment).
        clientTimestamp: new Date().toISOString(),
        latitude: location.latitude,
        longitude: location.longitude,
        address: location.address,
      });
    } finally {
      setIsVerifying(false);
    }
  }

  return {
    authError,
    isVerifying,
    isPunchingInFingerprint,
    isFingerprintPunchPaused,
    isFingerprintPunchError,
    fingerprintPunchError,
    handleVerifyFingerprint,
  };
}
