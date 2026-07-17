/**
 * Blink/head-turn challenge prompt UI (task 2.6, ADR-018) — presentational
 * only. The screen that embeds this owns the camera + frame worklet and
 * drives `result`/`timedOut` via `useLivenessChallenge` (native) or its web
 * equivalent (task 3.7); this component never touches a camera or platform
 * API itself, so it renders identically regardless of which platform's
 * signal extractor produced `result` — see ADR-018's shared-decision split.
 *
 * `timeoutMs` (task 4.13 follow-up, user-requested) drives an optional
 * visible countdown — the challenge previously timed out silently, which
 * reads as "is this stuck?" to a first-time user. It's optional and the
 * countdown is self-contained (its own ticking interval) so callers that
 * don't pass it keep the exact previous behavior — no new detection logic,
 * ADR-018's "reuse existing signals, no new ML" stance is untouched.
 * Restarting the countdown for a new attempt is the caller's job, via
 * React's own `key` prop (e.g. `key={faceAttemptId}`) — that's the
 * idiomatic way to force this component to remount and re-initialize its
 * internal timer, rather than this component needing its own
 * `attemptKey`-as-effect-dependency (which a "reset trigger no value in the
 * effect body actually reads" dependency can't cleanly express — that
 * pattern isn't recognized by `useExhaustiveDependencies`).
 */
import type { LivenessChallengeResult, LivenessChallengeType } from '@attendance-app/liveness';
import { useEffect, useState } from 'react';
import { Text, YStack } from 'tamagui';
import { FeedbackBanner } from './FeedbackBanner';

const CHALLENGE_INSTRUCTIONS: Record<LivenessChallengeType, string> = {
  blink: 'Blink naturally to confirm you’re here in person.',
  'blink-twice': 'Blink twice to confirm you’re here in person.',
  'head-turn': 'Slowly turn your head to one side, then back to center.',
  smile: 'Smile naturally at the camera.',
  nod: 'Nod your head slightly up and down.',
};

interface LivenessChallengeOverlayProps {
  type: LivenessChallengeType;
  result: LivenessChallengeResult;
  /** Set by the parent once its own challenge timeout elapses without a detection. */
  timedOut?: boolean;
  /** Total time allowed for this attempt, in ms — omit to skip the countdown. */
  timeoutMs?: number;
}

function useCountdownSeconds(timeoutMs: number | undefined, isActive: boolean): number | null {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(
    timeoutMs != null ? Math.ceil(timeoutMs / 1000) : null,
  );

  useEffect(() => {
    if (timeoutMs == null || !isActive) {
      return;
    }
    const deadline = Date.now() + timeoutMs;
    setSecondsRemaining(Math.ceil(timeoutMs / 1000));
    const timer = setInterval(() => {
      setSecondsRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeoutMs, isActive]);

  return timeoutMs == null ? null : secondsRemaining;
}

export function LivenessChallengeOverlay({
  type,
  result,
  timedOut = false,
  timeoutMs,
}: LivenessChallengeOverlayProps) {
  const secondsRemaining = useCountdownSeconds(timeoutMs, !result.detected && !timedOut);

  if (result.detected) {
    return <FeedbackBanner variant="success" message="Liveness confirmed." />;
  }

  if (timedOut) {
    // Guidance tone, not an error — a missed blink just needs another go
    // (user-requested #6), and the wording says exactly what to do.
    return (
      <FeedbackBanner
        variant="info"
        message="Almost — we didn't catch that in time. Keep your whole face in the oval and try again."
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
      {secondsRemaining != null ? (
        <Text color="$blue10" fontSize="$2">
          {secondsRemaining}s remaining
        </Text>
      ) : null}
    </YStack>
  );
}
