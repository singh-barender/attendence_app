/**
 * The "Notifications" card on `ProfileScreen`, split out
 * (coding-standards.md's "small, modular, single-responsibility files") —
 * two independent toggles (daily reminder, missed-checkout alert) since
 * they have meaningfully different resource costs (a single scheduled
 * alarm vs. recurring background execution).
 */
import { Button, Spinner, Text } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { FeedbackBanner } from './FeedbackBanner';
import { GlassCard } from './GlassCard';
import { SectionHeading } from './ProfileRows';

export interface ProfileNotificationsCardProps {
  isReminderEnabled: boolean;
  isTogglingReminder: boolean;
  reminderError: string | null;
  onToggleReminder: () => void;
  isMissedCheckoutEnabled: boolean;
  isTogglingMissedCheckout: boolean;
  missedCheckoutError: string | null;
  onToggleMissedCheckout: () => void;
}

export function ProfileNotificationsCard({
  isReminderEnabled,
  isTogglingReminder,
  reminderError,
  onToggleReminder,
  isMissedCheckoutEnabled,
  isTogglingMissedCheckout,
  missedCheckoutError,
  onToggleMissedCheckout,
}: ProfileNotificationsCardProps) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];

  return (
    <GlassCard>
      <SectionHeading>Notifications</SectionHeading>
      <Text style={{ color: palette.inkSoft }}>
        A daily local reminder to check in — no account/server involved, purely on this device.
      </Text>
      {reminderError ? <FeedbackBanner variant="error" message={reminderError} /> : null}
      <Button
        onPress={onToggleReminder}
        disabled={isTogglingReminder}
        style={{ backgroundColor: isReminderEnabled ? palette.accent : undefined }}
        {...(isTogglingReminder ? { icon: <Spinner /> } : {})}
      >
        <Text
          style={{
            color: isReminderEnabled ? palette.accentInk : palette.inkSoft,
            fontWeight: '700',
          }}
        >
          {isReminderEnabled ? 'DAILY REMINDER: ON' : 'DAILY REMINDER: OFF'}
        </Text>
      </Button>

      <Text style={{ color: palette.inkSoft }}>
        A low-frequency background check (at most every 15 minutes, batched by the OS) that alerts
        you if a check-in has stayed open unusually long.
      </Text>
      {missedCheckoutError ? (
        <FeedbackBanner variant="error" message={missedCheckoutError} />
      ) : null}
      <Button
        onPress={onToggleMissedCheckout}
        disabled={isTogglingMissedCheckout}
        style={{ backgroundColor: isMissedCheckoutEnabled ? palette.accent : undefined }}
        {...(isTogglingMissedCheckout ? { icon: <Spinner /> } : {})}
      >
        <Text
          style={{
            color: isMissedCheckoutEnabled ? palette.accentInk : palette.inkSoft,
            fontWeight: '700',
          }}
        >
          {isMissedCheckoutEnabled ? 'MISSED CHECKOUT ALERTS: ON' : 'MISSED CHECKOUT ALERTS: OFF'}
        </Text>
      </Button>
    </GlassCard>
  );
}
