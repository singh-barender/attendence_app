/**
 * Auto-looping "how this works" preview shown on the face-enrollment
 * permission screen (user-requested, task 4.13 follow-up), before the
 * camera is even granted access. Redesigned (still task 4.13 follow-up,
 * after user feedback that the first version — a lone rotating icon — was
 * "really un-understandable") to read like the reference UI the user
 * pointed to: a short imperative badge ("TURN LEFT"), a face-detection-style
 * bounding box around the avatar, a directional arrow overlapping the
 * frame's edge, and a step-progress dot row — the same visual vocabulary as
 * a real face-capture UI, not just an abstract rotating avatar.
 *
 * Cycles the same left → frontal → right sequence `FaceEnrollmentCapture`
 * asks for, and reuses its exact instruction copy (`ANGLE_INFO`, from the
 * standalone `utils/faceAngles` module — not imported from
 * `FaceEnrollmentCapture` itself, which would create a require cycle since
 * that component renders this one) so the hint never drifts out of sync
 * with the real guidance text shown one step later during actual capture.
 * Deliberately built from primitives already in this app (`@expo/vector-
 * icons` + RN's `Animated`, both already dependencies) rather than a new
 * GIF/Lottie asset — no real photo/illustration asset can be sourced in
 * this environment, and ADR-015 keeps this app at zero added cost/
 * dependencies wherever an existing primitive can do the job.
 */
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { ANGLE_INFO, type Angle } from '../utils/faceAngles';
import { HINT_FRAME_HEIGHT, HINT_FRAME_RADIUS, HINT_FRAME_WIDTH } from './registrationHintFrame';

/** How long each pose holds before the avatar turns to the next one. */
const HINT_STEP_DURATION_MS = 1600;

/** Loops center → left → center → right, rather than the capture flow's
 * left → right → frontal order — a "return to center" between turns reads
 * more like a natural head movement than jumping straight left-to-right. */
const HINT_SEQUENCE: readonly Angle[] = ['frontal', 'left', 'frontal', 'right'];

/** Distinct angles only (no repeated `frontal`) — drives the progress-dot
 * row, which marks *which angle* is active, not which step of the loop. */
const DOT_ORDER: readonly Angle[] = ['left', 'frontal', 'right'];

const FACE_BOX_WIDTH = 92;
const FACE_BOX_HEIGHT = 114;

const AVATAR_ROTATION_DEGREES: Record<Angle, number> = {
  left: -32,
  frontal: 0,
  right: 32,
};

const ANGLE_BADGE_LABEL: Record<Angle, string> = {
  left: 'TURN LEFT',
  frontal: 'LOOK CENTER',
  right: 'TURN RIGHT',
};

const AVATAR_ARROW: Record<Angle, ComponentProps<typeof Ionicons>['name'] | null> = {
  left: 'chevron-back',
  frontal: null,
  right: 'chevron-forward',
};

export function FaceAngleHint() {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  const [stepIndex, setStepIndex] = useState(0);
  const rotation = useRef(new Animated.Value(0)).current;

  const angle = HINT_SEQUENCE[stepIndex % HINT_SEQUENCE.length] ?? 'frontal';
  const arrowName = AVATAR_ARROW[angle];

  useEffect(() => {
    const id = setInterval(() => {
      setStepIndex((current) => current + 1);
    }, HINT_STEP_DURATION_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    Animated.timing(rotation, {
      toValue: AVATAR_ROTATION_DEGREES[angle],
      duration: HINT_STEP_DURATION_MS * 0.6,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [angle, rotation]);

  const rotateY = rotation.interpolate({
    inputRange: [-32, 32],
    outputRange: ['-32deg', '32deg'],
  });

  return (
    <YStack gap="$3" style={{ alignItems: 'center' }}>
      <YStack
        style={{
          paddingHorizontal: 14,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: palette.accent,
        }}
      >
        <Text
          style={{ color: palette.accentInk, fontWeight: '700', fontSize: 12, letterSpacing: 1 }}
        >
          {ANGLE_BADGE_LABEL[angle]}
        </Text>
      </YStack>

      <YStack
        style={{
          width: HINT_FRAME_WIDTH,
          height: HINT_FRAME_HEIGHT,
          borderRadius: HINT_FRAME_RADIUS,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.glassSurface,
          borderWidth: 1,
          borderColor: palette.glassBorder,
          overflow: 'visible',
        }}
      >
        <YStack
          style={{
            position: 'absolute',
            width: FACE_BOX_WIDTH,
            height: FACE_BOX_HEIGHT,
            borderRadius: 14,
            borderWidth: 2,
            borderColor: palette.accent,
          }}
        />
        <Animated.View style={{ transform: [{ perspective: 800 }, { rotateY }] }}>
          <Ionicons name="person" size={64} color={palette.accent} />
        </Animated.View>

        {arrowName ? (
          <YStack
            style={{
              position: 'absolute',
              top: '50%',
              marginTop: -18,
              ...(angle === 'left' ? { left: -18 } : { right: -18 }),
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: palette.accent,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: palette.glassSurface,
            }}
          >
            <Ionicons name={arrowName} size={20} color={palette.accentInk} />
          </YStack>
        ) : null}
      </YStack>

      <XStack gap="$2">
        {DOT_ORDER.map((dotAngle) => (
          <YStack
            key={dotAngle}
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: dotAngle === angle ? palette.accent : palette.glassBorder,
            }}
          />
        ))}
      </XStack>

      <Text style={{ color: palette.inkSoft, textAlign: 'center' }}>
        {ANGLE_INFO[angle].instruction}
      </Text>
    </YStack>
  );
}
