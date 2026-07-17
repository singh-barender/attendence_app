/**
 * Small color-coded pill for an `AttendanceStatus` value — used in the
 * attendance history list (task 1.19). Not `FeedbackBanner`: that's a
 * full-width message banner, this is an inline label next to a date.
 * `STATUS_STYLES` is exported so `AttendanceCalendar` (task 4.3) reuses the
 * exact same palette rather than inventing a second color mapping for the
 * same four statuses.
 *
 * Status is hours-worked-based (FULL_DAY/PARTIAL_DAY/OPEN/MISSED, task 4.13
 * follow-up) — "Late" (arrival-time) is a deliberately separate, independent
 * signal (`isLate`), rendered as its own small chip rather than folded into
 * the status color, so a late-but-full-day and an on-time-but-partial-day
 * both stay distinguishable. Raw hex values, not Tamagui `ColorTokens`: this
 * project's default Tamagui theme has no "brown" color family for the OPEN
 * status, so this follows `FeedbackBanner.tsx`'s existing precedent of using
 * plain style-prop colors wherever the token scale doesn't cover a needed hue.
 */
import { Text, XStack } from 'tamagui';
import type { AttendanceStatus } from '../generated/graphql';

export const STATUS_STYLES: Record<
  AttendanceStatus,
  { background: string; calendarBackground: string; text: string; label: string }
> = {
  // `background` is a subtle tint sized for this badge's own pill, sitting on
  // a card row. `calendarBackground` is the same hue at much higher alpha —
  // `AttendanceCalendar`'s day cells sit directly on this app's colorful
  // gradient backdrop, where the badge's low alpha reads as barely-there.
  FULL_DAY: {
    background: 'rgba(56, 176, 108, 0.16)',
    calendarBackground: 'rgba(56, 176, 108, 0.65)',
    text: '#2F9E5B',
    label: 'Full day',
  },
  PARTIAL_DAY: {
    background: 'rgba(217, 168, 47, 0.18)',
    calendarBackground: 'rgba(217, 168, 47, 0.65)',
    text: '#B58218',
    label: 'Partial day',
  },
  OPEN: {
    background: 'rgba(150, 96, 56, 0.2)',
    calendarBackground: 'rgba(150, 96, 56, 0.7)',
    text: '#96602F',
    label: 'Open',
  },
  MISSED: {
    background: 'rgba(224, 82, 82, 0.16)',
    calendarBackground: 'rgba(224, 82, 82, 0.65)',
    text: '#C23B3B',
    label: 'Missed',
  },
};

const LATE_CHIP_STYLE = { background: 'rgba(217, 143, 47, 0.16)', text: '#B5821A' };

export function StatusBadge({ status, isLate }: { status: AttendanceStatus; isLate?: boolean }) {
  const style = STATUS_STYLES[status];

  return (
    <XStack style={{ alignItems: 'center', gap: 6 }}>
      <XStack
        style={{
          borderRadius: 999,
          backgroundColor: style.background,
          paddingHorizontal: 8,
          paddingVertical: 4,
        }}
      >
        <Text style={{ color: style.text, fontSize: 12, fontWeight: '600' }}>{style.label}</Text>
      </XStack>
      {isLate ? (
        <XStack
          style={{
            borderRadius: 999,
            backgroundColor: LATE_CHIP_STYLE.background,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          <Text style={{ color: LATE_CHIP_STYLE.text, fontSize: 12, fontWeight: '600' }}>Late</Text>
        </XStack>
      ) : null}
    </XStack>
  );
}
