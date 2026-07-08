/**
 * Step indicator for the registration wizard — a row of segments plus a
 * "Step X of Y" label, so the user always knows how much is left.
 */
import { Text, XStack, YStack } from 'tamagui';

interface StepProgressProps {
  step: number;
  total: number;
  label: string;
}

export function StepProgress({ step, total, label }: StepProgressProps) {
  return (
    <YStack gap="$2">
      <XStack gap="$2">
        {Array.from({ length: total }, (_, index) => (
          <YStack
            key={`segment-${
              // biome-ignore lint/suspicious/noArrayIndexKey: segments are a fixed-length, static, non-reorderable sequence
              index
            }`}
            flex={1}
            height={4}
            style={{ borderRadius: 999 }}
            background={index < step ? '$color' : '$borderColor'}
          />
        ))}
      </XStack>
      <Text color="$color10" fontSize="$2">
        Step {step} of {total} — {label}
      </Text>
    </YStack>
  );
}
