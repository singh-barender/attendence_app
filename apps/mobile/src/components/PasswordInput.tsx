/**
 * Password field (ADR-030) — a lock-prefixed input with a trailing eye toggle
 * to reveal/hide the text, matching the app's `IconInput` styling. Reused by
 * registration Step 1 and the login screen so the two never drift. Text
 * starts masked (`secureTextEntry`) and never autocapitalizes/autocorrects.
 */
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { Input, XStack } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { GLASS_PALETTES } from '../theme/glassPalette';

const ICON_SIZE = 18;
const LEFT_PADDING = 42;
const RIGHT_PADDING = 44;

type PasswordInputProps = Omit<ComponentProps<typeof Input>, 'secureTextEntry'>;

export function PasswordInput(props: PasswordInputProps) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  const [revealed, setRevealed] = useState(false);

  return (
    <XStack style={{ alignItems: 'center', position: 'relative' }}>
      <Ionicons
        name="lock-closed-outline"
        size={ICON_SIZE}
        color={palette.inkSoft}
        style={{ position: 'absolute', left: 14, zIndex: 1 }}
      />
      <Input
        flex={1}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={!revealed}
        {...props}
        // @ts-expect-error Tamagui types want ColorTokens but a raw string works at runtime
        placeholderTextColor={palette.inkSoft}
        style={{
          color: palette.ink,
          backgroundColor: palette.glassSurface,
          borderColor: palette.glassBorder,
          paddingLeft: LEFT_PADDING,
          paddingRight: RIGHT_PADDING,
        }}
      />
      <Pressable
        onPress={() => setRevealed((value) => !value)}
        hitSlop={10}
        accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
        style={{ position: 'absolute', right: 12, zIndex: 1 }}
      >
        <Ionicons
          name={revealed ? 'eye-off-outline' : 'eye-outline'}
          size={ICON_SIZE}
          color={palette.inkSoft}
        />
      </Pressable>
    </XStack>
  );
}
