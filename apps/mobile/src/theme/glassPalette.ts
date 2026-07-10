/**
 * Single source of truth for the app-wide "glass card over a colorful
 * gradient" visual identity (user-requested redesign) — every color used by
 * `GradientBackground`/`GlassCard`/`IconInput` comes from here, so no
 * component hardcodes a hex value independently. Light and dark are each a
 * deliberately separate, tuned palette (same hue journey, different
 * luminance/saturation) rather than one inverted into the other, so the
 * existing theme toggle (task 4.7) keeps giving an equally-designed result
 * in both directions.
 */
import type { BlurTint } from 'expo-blur';

export interface GlassPalette {
  /** Multi-stop backdrop gradient, rendered once behind the whole app. */
  gradientStops: readonly [string, string, string, string, string];
  /** Translucent card fill, sitting on top of the BlurView. */
  glassSurface: string;
  /** Soft card border. */
  glassBorder: string;
  /** BlurView tint/intensity behind the glass fill. */
  blurTint: BlurTint;
  blurIntensity: number;
  /** Primary text on glass. */
  ink: string;
  /** Secondary/muted text on glass. */
  inkSoft: string;
  /** Icon glyphs, focus rings, primary CTA fill. */
  accent: string;
  /** Text color used on top of `accent` fills (e.g. primary button labels). */
  accentInk: string;
}

const DARK: GlassPalette = {
  gradientStops: ['#F2994A', '#8E54E9', '#4A6FE8', '#D9498B', '#E85D4A'],
  glassSurface: 'rgba(20, 18, 30, 0.55)',
  glassBorder: 'rgba(255, 255, 255, 0.14)',
  blurTint: 'dark',
  blurIntensity: 40,
  ink: '#F3F1F7',
  inkSoft: 'rgba(243, 241, 247, 0.65)',
  accent: '#B79CFF',
  accentInk: '#241B33',
};

const LIGHT: GlassPalette = {
  gradientStops: ['#FFD9B3', '#D8C6F5', '#BFD4FF', '#F7C6DE', '#FFC9B8'],
  glassSurface: 'rgba(255, 255, 255, 0.55)',
  glassBorder: 'rgba(36, 27, 51, 0.10)',
  blurTint: 'light',
  blurIntensity: 50,
  ink: '#241B33',
  inkSoft: 'rgba(36, 27, 51, 0.62)',
  accent: '#6B3FD1',
  accentInk: '#FFFFFF',
};

export const GLASS_PALETTES = { light: LIGHT, dark: DARK } as const;
