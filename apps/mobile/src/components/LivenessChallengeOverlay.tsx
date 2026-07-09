/**
 * Blink/head-turn challenge prompt UI (task 2.6, ADR-018) — presentational
 * only. The screen that embeds this owns the camera + frame worklet and
 * drives `result`/`timedOut` via `useLivenessChallenge` (native) or its web
 * equivalent (task 3.7); this component never touches a camera or platform
 * API itself, so it renders identically regardless of which platform's
 * signal extractor produced `result` — see ADR-018's shared-decision split.
 */
import type { LivenessChallengeResult, LivenessChallengeType } from '@attendance-app/liveness';
import { Text, YStack } from 'tamagui';
import { FeedbackBanner } from './FeedbackBanner';

const CHALLENGE_INSTRUCTIONS: Record<LivenessChallengeType, string> = {
  blink: 'Blink naturally to confirm you’re here in person.',
  'head-turn': 'Slowly turn your head to one side, then back to center.',
};

interface LivenessChallengeOverlayProps {
  type: LivenessChallengeType;
  result: LivenessChallengeResult;
  /** Set by the parent once its own challenge timeout elapses without a detection. */
  timedOut?: boolean;
}

export function LivenessChallengeOverlay({
  type,
  result,
  timedOut = false,
}: LivenessChallengeOverlayProps) {
  if (result.detected) {
    return <FeedbackBanner variant="success" message="Liveness confirmed." />;
  }

  if (timedOut) {
    return (
      <FeedbackBanner
        variant="error"
        message="We didn't catch that in time. Try again, making sure your whole face is in frame."
      />
    );
  }

  return (
    <YStack
      background="$blue2"
      borderColor="$blue6"
      borderWidth={1}
      p="$3"
      gap="$1"
      style={{ borderRadius: 8, alignItems: 'center' }}
    >
      <Text color="$blue11" fontWeight="600" style={{ textAlign: 'center' }}>
        {CHALLENGE_INSTRUCTIONS[type]}
      </Text>
    </YStack>
  );
}
