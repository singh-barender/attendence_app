/**
 * Single source of truth for the app-wide "glass card over a neutral
 * charcoal/white/grey gradient" visual identity (user-requested redesign)
 * — every color used by `GradientBackground`/`GlassCard`/`IconInput` comes
 * from here, so no component hardcodes a hex value independently. Light and
 * dark are each a deliberately separate, tuned palette (same neutral,
 * hueless tone journey, different luminance) rather than one inverted into
 * the other, so the existing theme toggle (task 4.7) keeps giving an
 * equally-designed result in both directions.
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
  /** Destructive-action fill (e.g. "Delete my account") — a red tuned to
   * read clearly on the glass surface in each theme, replacing a raw
   * `$red9`/`white` pairing that rendered as a low-contrast grey button. */
  danger: string;
  /** Text color used on top of `danger` fills. */
  dangerInk: string;
}

const DARK: GlassPalette = {
  // Deep graphite with a subtle cool tint
  gradientStops: ['#2B2C30', '#1E1F23', '#121316', '#1A1B1F', '#303238'],

  // More transparent so the blur actually shows through
  glassSurface: 'rgba(255, 255, 255, 0.08)',

  // Brighter edge gives the illusion of real glass
  glassBorder: 'rgba(255, 255, 255, 0.16)',

  blurTint: 'dark',
  blurIntensity: 70,

  ink: '#F7F8FA',
  inkSoft: 'rgba(247,248,250,0.72)',

  // Less saturated purple
  accent: '#8F7CFF',
  accentInk: '#FFFFFF',

  danger: '#E05D5D',
  dangerInk: '#FFFFFF',
};

const LIGHT: GlassPalette = {
  gradientStops: ['#FFFFFF', '#F8F9FB', '#EFF1F5', '#E8EBF0', '#F6F7F9'],

  // Real glass should be translucent
  glassSurface: 'rgba(255,255,255,0.38)',

  glassBorder: 'rgba(255,255,255,0.60)',

  blurTint: 'light',
  blurIntensity: 80,

  ink: '#1E2026',
  inkSoft: 'rgba(30,32,38,0.62)',

  accent: '#6754F6',
  accentInk: '#FFFFFF',

  danger: '#C93B3B',
  dangerInk: '#FFFFFF',
};

export const GLASS_PALETTES = { light: LIGHT, dark: DARK } as const;
