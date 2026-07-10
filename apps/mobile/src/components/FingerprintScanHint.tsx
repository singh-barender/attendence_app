/**
 * Auto-looping "how this works" hint shown alongside the fingerprint
 * confirmation prompt (user-requested, task 4.13 follow-up) — a pulsing
 * scan ring around a fingerprint glyph, in the exact same badge-label +
 * card-frame + caption layout as `FaceAngleHint` (frame size from the
 * shared `registrationHintFrame` module, not a locally-duplicated
 * constant — the first version of this hint used its own 132x132 circle,
 * which drifted out of sync with `FaceAngleHint`'s frame the moment that
 * one was redesigned). No progress dots here, unlike `FaceAngleHint`: a
 * fingerprint confirmation is one action, not a 3-pose sequence, so a dot
 * row would imply steps that don't exist.
 */
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { Text, YStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { HINT_FRAME_HEIGHT, HINT_FRAME_RADIUS, HINT_FRAME_WIDTH } from './registrationHintFrame';

const PULSE_DURATION_MS = 1100;

export function FingerprintScanHint() {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: PULSE_DURATION_MS,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.55, 0.25, 0] });
  const iconScale = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.08, 1] });

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
          TOUCH SENSOR
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
        }}
      >
        <Animated.View
          style={{
            position: 'absolute',
            width: 96,
            height: 96,
            borderRadius: 48,
            borderWidth: 2,
            borderColor: palette.accent,
            transform: [{ scale: ringScale }],
            opacity: ringOpacity,
          }}
        />
        <Animated.View style={{ transform: [{ scale: iconScale }] }}>
          <Ionicons name="finger-print" size={72} color={palette.accent} />
        </Animated.View>
      </YStack>

      <Text style={{ color: palette.inkSoft, textAlign: 'center' }}>
        Touch and hold your device's fingerprint sensor
      </Text>
    </YStack>
  );
}
