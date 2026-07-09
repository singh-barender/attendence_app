/**
 * Profile-screen re-enrollment for fingerprint (task 4.2, ADR-018) — reuses
 * the same `FingerprintConfirmationPanel` Step2FingerprintScreen uses during
 * registration. Only ever reachable via ProfileScreen's own
 * `FINGERPRINT_SUPPORTED` gate (ADR-005), so there's no web "skip" branch
 * here — this screen simply never renders on a platform without fingerprint
 * support.
 */
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { H1, Text, YStack } from 'tamagui';
import { FingerprintConfirmationPanel } from '../components/FingerprintConfirmationPanel';
import { useReEnrollFingerprintMutation } from '../generated/graphql';
import type { RootScreenProps } from '../navigation/types';
import { getErrorMessage } from '../services/graphqlError';

export function ReEnrollFingerprintScreen({ navigation }: RootScreenProps<'ReEnrollFingerprint'>) {
  const insets = useSafeAreaInsets();

  const { mutate, isPending, error, isError } = useReEnrollFingerprintMutation({
    onSuccess: () => navigation.navigate('Profile'),
  });

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <YStack flex={1} gap="$4" p="$4" background="$background">
        <H1>Re-enroll Fingerprint</H1>
        <Text color="$color10">
          Confirm your fingerprint again to replace your current enrollment — useful after a
          hardware change or if check-ins have started failing.
        </Text>
        <FingerprintConfirmationPanel
          promptMessage="Confirm your fingerprint to re-enroll"
          confirmLabel="Confirm Fingerprint"
          onConfirmed={() => mutate({})}
          isSubmitting={isPending}
          submitError={isError ? getErrorMessage(error) : null}
        />
        <YStack style={{ height: insets.bottom }} />
      </YStack>
    </ScrollView>
  );
}
