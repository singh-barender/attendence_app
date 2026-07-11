/**
 * Local, on-device daily reminder to punch in (task 4.11, ADR-022) — no
 * push server, no Firebase, no backend infrastructure: purely
 * `expo-notifications`' local `scheduleNotificationAsync`, which needs
 * nothing beyond the OS's own notification scheduler. Per ADR-022 this is
 * a fixed daily reminder, not a "only if you haven't punched in yet"
 * conditional one — that would need a background task
 * (`expo-task-manager`) periodically checking server state, deliberately
 * out of scope for this POC.
 *
 * There's no separate persisted "is the reminder on" flag — whether it's
 * enabled is derived directly from whether `REMINDER_IDENTIFIER` currently
 * has a scheduled notification (`getAllScheduledNotificationsAsync`), so
 * there's only one source of truth to ever drift out of sync with itself.
 */
import * as Notifications from 'expo-notifications';

export const NOTIFICATIONS_SUPPORTED = true;

/** Stable identifier so this specific reminder can be found/cancelled
 * without disturbing any other notification this app might ever schedule. */
const REMINDER_IDENTIFIER = 'daily-checkin-reminder';

/**
 * 15 minutes before `services/backend`'s `SHIFT_START_HOUR` default (9) —
 * a reminder that fires *after* the shift has already started misses the
 * point. This is a single global constant, not per-user configurable,
 * consistent with this app's existing no-multi-tenant/no-per-user-shift
 * stance (requirements.md).
 */
const REMINDER_HOUR = 8;
const REMINDER_MINUTE = 45;

export async function isDailyReminderEnabled(): Promise<boolean> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled.some((notification) => notification.identifier === REMINDER_IDENTIFIER);
}

/** Requests permission (if not already granted) and schedules the daily
 * reminder. Returns false without scheduling anything if the user declines
 * the permission prompt — the caller is responsible for surfacing that. */
export async function enableDailyReminder(): Promise<boolean> {
  const permissions = await Notifications.requestPermissionsAsync();
  if (!permissions.granted) {
    return false;
  }

  // Cancelling first keeps this idempotent — calling enable twice must
  // never result in two overlapping daily reminders.
  await Notifications.cancelScheduledNotificationAsync(REMINDER_IDENTIFIER);
  await Notifications.scheduleNotificationAsync({
    identifier: REMINDER_IDENTIFIER,
    content: {
      title: 'Check in reminder',
      body: "Don't forget to check in for today.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: REMINDER_HOUR,
      minute: REMINDER_MINUTE,
    },
  });
  return true;
}

export async function disableDailyReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REMINDER_IDENTIFIER);
}
