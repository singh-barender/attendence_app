/**
 * A compact, web-like dropdown anchored just below its trigger — unlike
 * Tamagui's `Select` (which forces a full bottom Sheet on native, since
 * `SelectImpl.native` has no inline/anchored mode at all — confirmed
 * directly against the installed package source, not assumed), `Popover`
 * has a genuine native floating-position implementation
 * (`useFloatingContext.native`), so it doesn't take over the screen.
 */
import { useState } from 'react';
import { Popover, Text, YStack } from 'tamagui';

interface InlineSelectFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly string[];
  placeholder: string;
}

export function InlineSelectField({
  value,
  onValueChange,
  options,
  placeholder,
}: InlineSelectFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen} placement="bottom-start" allowFlip>
      <Popover.Trigger
        borderWidth={1}
        borderColor="$borderColor"
        background="$background"
        p="$3"
        style={{ borderRadius: 8 }}
      >
        <Text color={value ? '$color' : '$color10'}>{value || placeholder}</Text>
      </Popover.Trigger>

      <Popover.Content
        borderWidth={1}
        borderColor="$borderColor"
        background="$background"
        p="$2"
        elevate
        style={{ borderRadius: 8 }}
      >
        <YStack gap="$1" style={{ minWidth: 180 }}>
          {options.map((option) => (
            <Text
              key={option}
              p="$2"
              onPress={() => {
                onValueChange(option);
                setOpen(false);
              }}
            >
              {option}
            </Text>
          ))}
        </YStack>
      </Popover.Content>
    </Popover>
  );
}
