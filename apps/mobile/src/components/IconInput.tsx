/**
 * Icon-prefixed input (user-requested redesign) — a leading glyph from
 * `@expo/vector-icons` overlaid on a standard Tamagui `Input`, matching the
 * reference image's email/password field style. Only adds the icon overlay
 * and left padding; text/placeholder color still comes from Tamagui's own
 * active theme, so it keeps resolving correctly with the light/dark toggle
 * without this component needing to know about `glassPalette` itself.
 *
 * The icon's left offset + size + gap is applied to the Input as an
 * explicit pixel `paddingLeft` in `style` rather than Tamagui's `pl` space
 * token — a token (e.g. `$7`) doesn't reliably resolve to enough clearance
 * for this icon's actual footprint, which let the icon overlap the
 * placeholder/typed text.
 */
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Input, XStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { GLASS_PALETTES } from '../theme/glassPalette';

const ICON_LEFT_OFFSET = 14;
const ICON_SIZE = 18;
const ICON_TEXT_GAP = 10;
const INPUT_LEFT_PADDING = ICON_LEFT_OFFSET + ICON_SIZE + ICON_TEXT_GAP;

interface IconInputProps extends ComponentProps<typeof Input> {
  icon: ComponentProps<typeof Ionicons>['name'];
}

export function IconInput({ icon, ...inputProps }: IconInputProps) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];

  return (
    <XStack style={{ alignItems: 'center', position: 'relative' }}>
      <Ionicons
        name={icon}
        size={ICON_SIZE}
        color={palette.inkSoft}
        style={{ position: 'absolute', left: ICON_LEFT_OFFSET, zIndex: 1 }}
      />
      <Input flex={1} {...inputProps} style={{ paddingLeft: INPUT_LEFT_PADDING }} />
    </XStack>
  );
}
