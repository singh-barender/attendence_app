/**
 * Consistent error/success/info feedback across every screen — a plain red
 * `<Text>` line doesn't stand out enough to count as a real error/success
 * *state* (audit checkpoint 1.C requires loading/empty/error/success states
 * to actually exist, not just be technically present).
 *
 * Background/border are translucent (raw rgba, not Tamagui's opaque
 * `$red2`-style tokens) so a banner reads as an overlay on the glass card
 * behind it (user-requested redesign) instead of a solid sticker breaking
 * the glass illusion. Icon/text stay on Tamagui's own theme tokens — those
 * already resolve correctly per light/dark and carry the semantic meaning
 * (error/success/info), which must stay separate from the new accent color
 * and untouched by this restyle.
 */
import type { ColorTokens } from 'tamagui';
import { Text, YStack } from 'tamagui';

type FeedbackVariant = 'error' | 'success' | 'info' | 'pending';

interface VariantStyle {
  background: string;
  border: string;
  text: ColorTokens;
  icon: string;
}

const VARIANT_STYLES: Record<FeedbackVariant, VariantStyle> = {
  error: {
    background: 'rgba(224, 82, 82, 0.16)',
    border: 'rgba(224, 82, 82, 0.4)',
    text: '$red10',
    icon: '⚠',
  },
  success: {
    background: 'rgba(56, 176, 108, 0.16)',
    border: 'rgba(56, 176, 108, 0.4)',
    text: '$green10',
    icon: '✓',
  },
  info: {
    background: 'rgba(74, 111, 232, 0.16)',
    border: 'rgba(74, 111, 232, 0.4)',
    text: '$blue10',
    icon: 'ⓘ',
  },
  // A queued-but-not-yet-server-confirmed punch (ADR-017) must read as
  // visibly distinct from both "success" and an ordinary "info" note — an
  // amber/hourglass treatment reads as "still in progress," not "done" or
  // "just FYI."
  pending: {
    background: 'rgba(217, 143, 47, 0.16)',
    border: 'rgba(217, 143, 47, 0.4)',
    text: '$yellow10',
    icon: '⏳',
  },
};

interface FeedbackBannerProps {
  variant: FeedbackVariant;
  message: string;
}

export function FeedbackBanner({ variant, message }: FeedbackBannerProps) {
  const styles = VARIANT_STYLES[variant];

  return (
    <YStack
      p="$3"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        borderRadius: 8,
        backgroundColor: styles.background,
        borderColor: styles.border,
        borderWidth: 1,
      }}
      gap="$2"
    >
      <Text color={styles.text}>{styles.icon}</Text>
      <Text color={styles.text} flex={1}>
        {message}
      </Text>
    </YStack>
  );
}
