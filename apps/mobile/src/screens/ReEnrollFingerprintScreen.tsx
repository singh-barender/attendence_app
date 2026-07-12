/**
 * Profile-screen re-enrollment for fingerprint (task 4.2, ADR-018) — reuses
 * the same `FingerprintConfirmationPanel` Step2FingerprintScreen uses during
 * registration. Only ever reachable via ProfileScreen's own
 * `FINGERPRINT_SUPPORTED` gate (ADR-005), so there's no web "skip" branch
 * here — this screen simply never renders on a platform without fingerprint
 * support.
 */

import { FingerprintConfirmationPanel } from '../components/FingerprintConfirmationPanel';
import { GlassCard } from '../components/GlassCard';
import { ScreenContainer } from '../components/ScreenContainer';
import { useReEnrollFingerprintMutation } from '../generated/graphql';
import type { RootScreenProps } from '../navigation/types';
import { getErrorMessage } from '../services/graphqlError';

export function ReEnrollFingerprintScreen({ navigation }: RootScreenProps<'ReEnrollFingerprint'>) {
  const { mutate, isPending, error, isError } = useReEnrollFingerprintMutation({
    onSuccess: () => navigation.navigate('Profile'),
  });

  return (
    <ScreenContainer
      title="Re-enroll Fingerprint"
      description="Confirm your fingerprint again to replace your current enrollment — useful after a hardware change or if check-ins have started failing."
    >
      <GlassCard>
        <FingerprintConfirmationPanel
          promptMessage="Confirm your fingerprint to re-enroll"
          confirmLabel="Confirm Fingerprint"
          onConfirmed={() => mutate({})}
          isSubmitting={isPending}
          submitError={isError ? getErrorMessage(error) : null}
        />
      </GlassCard>
    </ScreenContainer>
  );
}
