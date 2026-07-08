/**
 * Shared screen chrome (padding, gap, title) so screens don't hand-duplicate
 * the same Tamagui layout — an optional `progress` slot renders between the
 * description and children (used by the registration wizard's step
 * indicator, task 1.15+ UI pass). `keyboardShouldPersistTaps="handled"`
 * avoids the common RN gotcha where a button tap while the keyboard is open
 * gets swallowed as a dismiss-keyboard tap instead of firing onPress.
 * Bottom safe-area inset keeps the last piece of content clear of gesture
 * navigation bars on notched/gesture-nav devices.
 */
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { H1, Text, YStack } from 'tamagui';

interface ScreenContainerProps {
  title: string;
  description: string;
  progress?: ReactNode;
  children?: ReactNode;
}

export function ScreenContainer({ title, description, progress, children }: ScreenContainerProps) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <YStack flex={1} gap="$4" p="$4" background="$background">
        <H1>{title}</H1>
        {progress}
        <Text color="$color">{description}</Text>
        {children}
        <YStack style={{ height: insets.bottom }} />
      </YStack>
    </ScrollView>
  );
}
