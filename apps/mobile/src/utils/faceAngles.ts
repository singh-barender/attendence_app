/**
 * The three enrollment/verification face angles, and their per-angle
 * copy + live-guide yaw range — extracted to its own module (rather than
 * living in `FaceEnrollmentCapture.tsx`, which originally defined it) so
 * that both `FaceEnrollmentCapture` and the presentational `FaceAngleHint`
 * can import it without importing *each other*, which produced a require
 * cycle (Metro warning: "Require cycle: FaceEnrollmentCapture.tsx ->
 * FaceAngleHint.tsx -> FaceEnrollmentCapture.tsx").
 */
import { MAX_FRONTAL_YAW_DEGREES, MIN_PROFILE_YAW_DEGREES } from './liveFaceAlignment';

export const ANGLES = ['left', 'right', 'frontal'] as const;
export type Angle = (typeof ANGLES)[number];

/**
 * Per-angle live-guide yaw range — the bound the live yaw must fall within
 * for `assessLiveAlignment` to consider the current angle "aligned".
 * `left`/`right` deliberately leave one side open-ended (`Infinity`): any
 * turn past the minimum still counts as that profile, there's no such
 * thing as "too far turned" for this guide.
 */
export const ANGLE_INFO: Record<
  Angle,
  { label: string; instruction: string; minYaw: number; maxYaw: number }
> = {
  left: {
    label: 'Left profile',
    instruction: 'Turn your head slightly to show your left profile',
    minYaw: -Infinity,
    maxYaw: -MIN_PROFILE_YAW_DEGREES,
  },
  right: {
    label: 'Right profile',
    instruction: 'Turn your head slightly to show your right profile',
    minYaw: MIN_PROFILE_YAW_DEGREES,
    maxYaw: Infinity,
  },
  frontal: {
    label: 'Frontal',
    instruction: 'Face the camera directly',
    minYaw: -MAX_FRONTAL_YAW_DEGREES,
    maxYaw: MAX_FRONTAL_YAW_DEGREES,
  },
};
