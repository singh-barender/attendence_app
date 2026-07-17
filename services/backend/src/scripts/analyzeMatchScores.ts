/**
 * Reports the real face-match score distribution, split by outcome
 * (architecture-review-2026-07-16.md's F4) — `MATCH_THRESHOLD`/
 * `FACE_MATCH_THRESHOLD` are both explicitly documented as unvalidated
 * placeholders pending calibration against real genuine/impostor score
 * data; this is that calibration exercise, made repeatable rather than a
 * one-off manual query, so it can simply be re-run as more real usage
 * accumulates in `VerificationAttempt` (which already records every score
 * for exactly this purpose — see its own schema comment).
 *
 * This does not (and cannot) run the actual calibration itself in this
 * environment — that requires real genuine and impostor punch attempts
 * from real users, which don't exist here (see docs/architecture-review
 * -2026-07-16.md's F4 entry for why this is a data-collection exercise, not
 * a code change). What this script provides is the analysis step: once
 * real data exists, `pnpm --filter @attendance-app/backend analyze-match-scores`
 * reports the genuine/impostor score gap so a threshold can be chosen from
 * it, instead of guessed.
 */
import { config } from '../config';
import { prisma } from '../db/client';

interface ScoreSummary {
  count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
}

function summarize(scores: readonly number[]): ScoreSummary {
  if (scores.length === 0) {
    return { count: 0, min: null, max: null, mean: null };
  }
  return {
    count: scores.length,
    min: Math.min(...scores),
    max: Math.max(...scores),
    mean: scores.reduce((sum, score) => sum + score, 0) / scores.length,
  };
}

async function main(): Promise<void> {
  const attempts = await prisma.verificationAttempt.findMany({
    where: { method: 'FACE', matchScore: { not: null } },
    select: { outcome: true, matchScore: true },
  });

  const successScores = attempts
    .filter((attempt) => attempt.outcome === 'SUCCESS')
    .map((attempt) => attempt.matchScore as number);
  const failureScores = attempts
    .filter((attempt) => attempt.outcome === 'FAILURE')
    .map((attempt) => attempt.matchScore as number);

  const successSummary = summarize(successScores);
  const failureSummary = summarize(failureScores);

  console.log(`Current FACE_MATCH_THRESHOLD: ${config.faceMatchThreshold}`);
  console.log('');
  console.log('SUCCESS (matched) scores:', successSummary);
  console.log('FAILURE (not matched) scores:', failureSummary);
  console.log('');

  if (successSummary.count === 0 && failureSummary.count === 0) {
    console.log(
      'No FACE verification attempts recorded yet — nothing to calibrate against. ' +
        'This is expected for a fresh database; re-run this script once real ' +
        'punch attempts have accumulated.',
    );
    return;
  }

  // A genuine calibration needs *impostor* attempts too (deliberately
  // verifying as a different enrolled account) — a FAILURE outcome here
  // could equally mean "same person, poor capture conditions" as "different
  // person", so this script reports the raw split honestly rather than
  // pretending FAILURE == impostor.
  console.log(
    'Note: FAILURE here includes both poor-capture-conditions same-person ' +
      'failures and genuine impostor attempts — this script cannot ' +
      'distinguish them from matchScore alone. A real calibration exercise ' +
      "needs deliberately-labeled impostor attempts (see this file's header " +
      'comment) to find the actual genuine/impostor score gap.',
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
