/**
 * Profile-screen re-enrollment for face (task 4.2, ADR-018) — reuses the
 * same `FaceEnrollmentCapture` component Step3FaceEnrollScreen uses during
 * registration, so re-enrollment holds the exact same quality bar as
 * initial enrollment rather than a shortened flow. The backend supersedes
 * (not deletes) the prior embeddings on success (ADR-018), so an old,
 * changed-appearance face can never match again after this completes.
 */
import {
  FaceEnrollmentCapture,
  type FaceEnrollmentEmbeddings,
} from '../components/FaceEnrollmentCapture';
import { ScreenContainer } from '../components/ScreenContainer';
import { useReEnrollFaceMutation } from '../generated/graphql';
import type { RootScreenProps } from '../navigation/types';
import { getErrorMessage } from '../services/graphqlError';

export function ReEnrollFaceScreen({ navigation }: RootScreenProps<'ReEnrollFace'>) {
  const { mutate, isPending, error, isError } = useReEnrollFaceMutation({
    onSuccess: () => navigation.navigate('Profile'),
  });

  function handleFinish(embeddings: FaceEnrollmentEmbeddings) {
    mutate({ embeddings });
  }

  return (
    <ScreenContainer
      title="Re-enroll Face"
      description="Capture your face again to replace your current enrollment."
    >
      <FaceEnrollmentCapture
        onFinish={handleFinish}
        isSubmitting={isPending}
        submitError={isError ? getErrorMessage(error) : null}
        finishLabel="Finish re-enrollment"
        finishingLabel="Finishing..."
      />
    </ScreenContainer>
  );
}
