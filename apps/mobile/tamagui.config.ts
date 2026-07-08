/**
 * Single source of design tokens (colors, spacing, radii, typography) for
 * the whole app (ADR-009) — every component reads from these tokens, never
 * a raw hex/pixel value. Built on Tamagui's default token set (v5), which
 * is itself already a professionally designed, accessible system; custom
 * brand tokens can be layered on top later without restructuring this file.
 *
 * `@tamagui/config/v5`'s `defaultConfig` ships with no `animations` driver
 * at all — fine for static styling, but components that animate (Sheet,
 * AnimatePresence-based ones) crash without one (see decisions.md ADR-026).
 * `v5-rn` adds the RN-`Animated`-based driver, which is what `@tamagui/sheet`
 * itself already depends on — no extra native dependency (e.g. Reanimated)
 * needed.
 */
import { defaultConfig } from '@tamagui/config/v5';
import { animations } from '@tamagui/config/v5-rn';
import { createTamagui } from 'tamagui';

export const tamaguiConfig = createTamagui({ ...defaultConfig, animations });

export default tamaguiConfig;

export type Conf = typeof tamaguiConfig;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
