/**
 * Step 3 of registration (requirements.md) — guided left/right/frontal
 * photo capture. The camera/quality-gate/embedding logic lives in the
 * shared `FaceEnrollmentCapture` component (task 4.2), reused by
 * profile-screen re-enrollment (`ReEnrollFaceScreen`); this screen only
 * owns the registration-specific bits: reading `userId` from the route,
 * calling `registerStep3`, and handing off to check-in on success.
 */
import {
  FaceEnrollmentCapture,
  type FaceEnrollmentEmbeddings,
} from '../../components/FaceEnrollmentCapture';
import { ScreenContainer } from '../../components/ScreenContainer';
import { StepProgress } from '../../components/StepProgress';
import { useRegisterStep3Mutation } from '../../generated/graphql';
import type { RootScreenProps } from '../../navigation/types';
import { getErrorMessage } from '../../services/graphqlError';

export function Step3FaceEnrollScreen({ navigation, route }: RootScreenProps<'RegisterStep3'>) {
  const { userId, email } = route.params;

  const { mutate, isPending, error, isError } = useRegisterStep3Mutation({
    // Registration is done — hand straight off to check-in with the email
    // already known, so the very next thing is "Verify Face to check in"
    // rather than an empty history screen or a blank email field. `reset`
    // (not `navigate`) clears the whole registration stack so the back
    // button can't return into a half-finished wizard.
    onSuccess: () => navigation.reset({ index: 0, routes: [{ name: 'Login', params: { email } }] }),
  });

  function handleFinish(embeddings: FaceEnrollmentEmbeddings) {
    mutate({ userId, embeddings });
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
