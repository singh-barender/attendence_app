/**
 * Small color-coded pill for an `AttendanceStatus` value — used in the
 * attendance history list (task 1.19). Not `FeedbackBanner`: that's a
 * full-width message banner, this is an inline label next to a date.
 */
import type { ColorTokens } from 'tamagui';
import { Text, XStack } from 'tamagui';
import type { AttendanceStatus } from '../generated/graphql';

const STATUS_STYLES: Record<
  AttendanceStatus,
  { background: ColorTokens; text: ColorTokens; label: string }
> = {
  PRESENT: { background: '$green3', text: '$green11', label: 'Present' },
  LATE: { background: '$yellow3', text: '$yellow11', label: 'Late' },
  INCOMPLETE: { background: '$red3', text: '$red11', label: 'Incomplete' },
};

export function StatusBadge({ status }: { status: AttendanceStatus }) {
  const style = STATUS_STYLES[status];

  return (
    <XStack background={style.background} px="$2" py="$1" style={{ borderRadius: 999 }}>
      <Text color={style.text} fontSize="$2" fontWeight="600">
        {style.label}
      </Text>
    </XStack>
  );
}
