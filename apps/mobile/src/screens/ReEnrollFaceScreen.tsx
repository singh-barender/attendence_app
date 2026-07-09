/**
 * Profile-screen re-enrollment for face (task 4.2, ADR-018) — reuses the
 * same `FaceEnrollmentCapture` component Step3FaceEnrollScreen uses during
 * registration, so re-enrollment holds the exact same quality bar as
 * initial enrollment rather than a shortened flow. The backend supersedes
 * (not deletes) the prior embeddings on success (ADR-018), so an old,
 * changed-appearance face can never match again after this completes.
 */
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { H1, YStack } from 'tamagui';
import {
  FaceEnrollmentCapture,
  type FaceEnrollmentEmbeddings,
} from '../components/FaceEnrollmentCapture';
import { useReEnrollFaceMutation } from '../generated/graphql';
import type { RootScreenProps } from '../navigation/types';
import { getErrorMessage } from '../services/graphqlError';

export function ReEnrollFaceScreen({ navigation }: RootScreenProps<'ReEnrollFace'>) {
  const insets = useSafeAreaInsets();

  const { mutate, isPending, error, isError } = useReEnrollFaceMutation({
    onSuccess: () => navigation.navigate('Profile'),
  });

  function handleFinish(embeddings: FaceEnrollmentEmbeddings) {
    mutate({ embeddings });
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <YStack flex={1} gap="$4" p="$4" background="$background">
        <H1>Re-enroll Face</H1>
        <FaceEnrollmentCapture
          onFinish={handleFinish}
          isSubmitting={isPending}
          submitError={isError ? getErrorMessage(error) : null}
          finishLabel="Finish re-enrollment"
          finishingLabel="Finishing..."
        />
        <YStack style={{ height: insets.bottom }} />
      </YStack>
    </ScrollView>
  );
}
