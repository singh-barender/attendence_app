/**
 * The one card every screen uses (user-requested redesign) — replaces the
 * copy-pasted `YStack borderWidth={1} borderColor="$borderColor" p="$3"
 * style={{borderRadius:8}}` pattern that previously appeared, byte-for-byte
 * identical, in ProfileScreen (x5), AttendanceScreen, and elsewhere. A real
 * `BlurView` blurs whatever sits behind the card (the app-wide gradient,
 * `GradientBackground`), a translucent tint sits on top of the blur, and
 * content renders above both — the genuine glassmorphism look, not just a
 * semi-transparent box.
 *
 * Padding/gap are applied to the inner content layer, not the outer
 * clipping container — putting them on the outer box would leave a gap at
 * the card's edges where the raw gradient shows through unblurred.
 */
import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import type { SpaceTokens } from 'tamagui';
import { YStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { GLASS_PALETTES } from '../theme/glassPalette';

interface GlassCardProps {
  children?: ReactNode;
  p?: SpaceTokens;
  gap?: SpaceTokens;
  flex?: number;
}

export function GlassCard({ children, p = '$3', gap = '$2', flex }: GlassCardProps) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];

  return (
    <YStack
      {...(flex != null ? { flex } : {})}
      style={{
        borderWidth: 1,
        borderColor: palette.glassBorder,
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <BlurView
        tint={palette.blurTint}
        intensity={palette.blurIntensity}
        style={StyleSheet.absoluteFill}
      />
      <YStack style={{ ...StyleSheet.absoluteFill, backgroundColor: palette.glassSurface }} />
      <YStack p={p} gap={gap} style={{ position: 'relative' }}>
        {children}
      </YStack>
    </YStack>
  );
}
