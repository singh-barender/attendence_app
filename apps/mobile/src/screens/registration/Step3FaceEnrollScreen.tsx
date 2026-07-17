/**
 * Step 3 of registration (requirements.md) — guided left/right/frontal
 * photo capture. The camera/quality-gate/embedding logic lives in the
 * shared `FaceEnrollmentCapture` component (task 4.2), reused by
 * profile-screen re-enrollment (`ReEnrollFaceScreen`); this screen only owns
 * the registration-specific bits: calling `registerStep3` (authenticated via
 * the session token Step 1 already stored) and handing off to the dashboard
 * on success.
 */
import {
  FaceEnrollmentCapture,
  type FaceEnrollmentEmbeddings,
} from '../../components/FaceEnrollmentCapture';
import { ScreenContainer } from '../../components/ScreenContainer';
import { StepProgress } from '../../components/StepProgress';
import { useRegisterStep3Mutation } from '../../generated/graphql';
import type { RootScreenProps } from '../../navigation/types';
import { EMBEDDING_MODEL_ID } from '../../platform/faceEmbedder';
import { getErrorMessage } from '../../services/graphqlError';

export function Step3FaceEnrollScreen({ navigation }: RootScreenProps<'RegisterStep3'>) {
  const { mutate, isPending, error, isError } = useRegisterStep3Mutation({
    // Registration is done, and the session token was already stored back
    // at Step 1 — go straight to the dashboard rather than back through
    // Login (which would just auto-redirect here anyway now that a token
    // exists, per AuthLoginScreen's own session-persistence check). `reset`
    // (not `navigate`) clears the whole registration stack so the back
    // button can't return into a half-finished wizard.
    onSuccess: () => navigation.reset({ index: 0, routes: [{ name: 'Attendance' }] }),
  });

  function handleFinish(embeddings: FaceEnrollmentEmbeddings) {
    // Tags which model produced these embeddings (architecture-review-2026
    // -07-16.md's F3) — Android/web embeddings are incompatible, so the
    // server needs to know which space these belong to.
    mutate({ embeddings, embeddingModel: EMBEDDING_MODEL_ID });
  }

  return (
    <ScreenContainer
      title="Face Enrollment"
      description="One last step to enable face check-in."
      progress={<StepProgress step={3} total={3} label="Face enrollment" />}
    >
      <FaceEnrollmentCapture
        onFinish={handleFinish}
        isSubmitting={isPending}
        submitError={isError ? getErrorMessage(error) : null}
        finishLabel="Finish registration"
        finishingLabel="Finishing..."
      />
    </ScreenContainer>
  );
}
