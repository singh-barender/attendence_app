/**
 * Consistent error/success/info feedback across every screen — a plain red
 * `<Text>` line doesn't stand out enough to count as a real error/success
 * *state* (audit checkpoint 1.C requires loading/empty/error/success states
 * to actually exist, not just be technically present).
 */
import type { ColorTokens } from 'tamagui';
import { Text, YStack } from 'tamagui';

type FeedbackVariant = 'error' | 'success' | 'info';

interface VariantStyle {
  background: ColorTokens;
  border: ColorTokens;
  text: ColorTokens;
  icon: string;
}

const VARIANT_STYLES: Record<FeedbackVariant, VariantStyle> = {
  error: { background: '$red2', border: '$red6', text: '$red10', icon: '⚠' },
  success: { background: '$green2', border: '$green6', text: '$green10', icon: '✓' },
  info: { background: '$blue2', border: '$blue6', text: '$blue10', icon: 'ⓘ' },
};

interface FeedbackBannerProps {
  variant: FeedbackVariant;
  message: string;
}

export function FeedbackBanner({ variant, message }: FeedbackBannerProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <YStack
      background={styles.background}
      borderColor={styles.border}
      borderWidth={1}
      p="$3"
      style={{ flexDirection: 'row', alignItems: 'flex-start', borderRadius: 8 }}
      gap="$2"
    >
      <Text color={styles.text}>{styles.icon}</Text>
      <Text color={styles.text} flex={1}>
        {message}
      </Text>
    </YStack>
  );
}
