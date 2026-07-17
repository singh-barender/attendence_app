/**
 * The app's colorful backdrop, mounted once at the root (App.tsx) behind
 * the whole navigator — not per-screen. `@tamagui/linear-gradient`'s
 * `LinearGradient` paints its own gradient fill and renders `children` on
 * top of it, so wrapping the entire navigator here is the whole
 * implementation; every screen just needs a transparent background
 * (RootNavigator's `screenOptions`) to let it show through.
 */
import { LinearGradient } from '@tamagui/linear-gradient';
import type { ReactNode } from 'react';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { GLASS_PALETTES } from '../theme/glassPalette';

export function GradientBackground({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];

  return (
    <LinearGradient
      flex={1}
      colors={[...palette.gradientStops]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {children}
    </LinearGradient>
  );
}
