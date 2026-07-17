/**
 * Profile-screen re-enrollment for face (task 4.2, ADR-018) — reuses the
 * same `FaceEnrollmentCapture` component Step3FaceEnrollScreen uses during
 * registration, so re-enrollment holds the exact same quality bar as
 * initial enrollment rather than a shortened flow. The backend supersedes
 * (not deletes) the prior embeddings on success (ADR-018), so an old,
 * changed-appearance face can never match again after this completes.
 *
 * Replacing stored face embeddings is a sensitive action (whoever holds an
 * unlocked, still-logged-in device — or a stolen session token — could
 * otherwise re-enroll *their* face and punch in as this account), so it's
 * gated behind a fresh password re-confirmation first
 * (architecture-review-2026-07-16.md's F11). This is deliberately a
 * password check, not a fingerprint one: a fingerprint success is only ever
 * a client-side assertion the server can't independently verify (ADR-005),
 * so using it here would just move the "trust the client" problem to a new
 * mutation rather than closing it — a password re-entry, verified
 * server-side via `confirmStepUp`, is the only check that actually proves
 * anything to the server.
 */
import { useState } from 'react';
import {
  FaceEnrollmentCapture,
  type FaceEnrollmentEmbeddings,
} from '../components/FaceEnrollmentCapture';
import { FeedbackBanner } from '../components/FeedbackBanner';
import { ScreenContainer } from '../components/ScreenContainer';
import { StepUpPasswordConfirmation } from '../components/StepUpPasswordConfirmation';
import { useReEnrollFaceMutation } from '../generated/graphql';
import type { RootScreenProps } from '../navigation/types';
import { EMBEDDING_MODEL_ID } from '../platform/faceEmbedder';
import { getErrorMessage } from '../services/graphqlError';

export function ReEnrollFaceScreen({ navigation }: RootScreenProps<'ReEnrollFace'>) {
  const [stepUpToken, setStepUpToken] = useState<string | null>(null);

  const { mutate, isPending, error, isError } = useReEnrollFaceMutation({
    onSuccess: () => navigation.navigate('Profile'),
  });

  function handleFinish(embeddings: FaceEnrollmentEmbeddings) {
    if (!stepUpToken) {
      return;
    }
    // Tags which model produced these embeddings (architecture-review-2026
    // -07-16.md's F3) — see Step3FaceEnrollScreen's matching comment.
    mutate({ embeddings, embeddingModel: EMBEDDING_MODEL_ID, stepUpToken });
  }

  return (
    <ScreenContainer
      title="Re-enroll Face"
      description="Capture your face again to replace your current enrollment."
    >
      {stepUpToken ? (
        <FaceEnrollmentCapture
          onFinish={handleFinish}
          isSubmitting={isPending}
          submitError={isError ? getErrorMessage(error) : null}
          finishLabel="Finish re-enrollment"
          finishingLabel="Finishing..."
        />
      ) : (
        <>
          <FeedbackBanner
            variant="info"
            message="For your security, re-enter your password before replacing your face enrollment."
          />
          <StepUpPasswordConfirmation
            promptMessage="Confirm your password to re-enroll your face"
            confirmLabel="Confirm password"
            onConfirmed={setStepUpToken}
          />
        </>
      )}
    </ScreenContainer>
  );
}
