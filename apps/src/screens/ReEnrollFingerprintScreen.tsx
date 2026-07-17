/**
 * Profile-screen re-enrollment for fingerprint (task 4.2, ADR-018). Only
 * ever reachable via ProfileScreen's own `FINGERPRINT_SUPPORTED` gate
 * (ADR-005), so there's no web "skip" branch here — this screen simply
 * never renders on a platform without fingerprint support.
 *
 * Requires a fresh password step-up (architecture-review-2026-07-16.md's
 * F11) before the actual OS fingerprint confirmation — a password
 * re-confirmation, verified server-side via `confirmStepUp`, is what
 * actually proves anything to the server; the fingerprint confirmation
 * itself is only ever a client-side assertion (ADR-005) the server can't
 * independently check, so it can't be the *only* gate on a sensitive
 * biometric-replacing action.
 */

import { useState } from 'react';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { FingerprintConfirmationPanel } from '../components/FingerprintConfirmationPanel';
import { GlassCard } from '../components/GlassCard';
import { ScreenContainer } from '../components/ScreenContainer';
import { StepUpPasswordConfirmation } from '../components/StepUpPasswordConfirmation';
import { useReEnrollFingerprintMutation } from '../generated/graphql';
import type { RootScreenProps } from '../navigation/types';
import { getErrorMessage } from '../services/graphqlError';

export function ReEnrollFingerprintScreen({ navigation }: RootScreenProps<'ReEnrollFingerprint'>) {
  const [stepUpToken, setStepUpToken] = useState<string | null>(null);

  const { mutate, isPending, error, isError } = useReEnrollFingerprintMutation({
    onSuccess: () => navigation.navigate('Profile'),
  });

  return (
    <ScreenContainer
      title="Re-enroll Fingerprint"
      description="Confirm your fingerprint again to replace your current enrollment — useful after a hardware change or if check-ins have started failing."
    >
      <GlassCard>
        {stepUpToken ? (
          <FingerprintConfirmationPanel
            promptMessage="Confirm your fingerprint to re-enroll"
            confirmLabel="Confirm Fingerprint"
            onConfirmed={() => mutate({ stepUpToken })}
            isSubmitting={isPending}
            submitError={isError ? getErrorMessage(error) : null}
          />
        ) : (
          <>
            <FeedbackBanner
              variant="info"
              message="For your security, re-enter your password before replacing your fingerprint enrollment."
            />
            <StepUpPasswordConfirmation
              promptMessage="Confirm your password to re-enroll your fingerprint"
              confirmLabel="Confirm password"
              onConfirmed={setStepUpToken}
            />
          </>
        )}
      </GlassCard>
    </ScreenContainer>
  );
}
