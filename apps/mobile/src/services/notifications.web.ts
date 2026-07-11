/**
 * Web counterpart of `notifications.native.ts` (task 4.12, ADR-022) —
 * an explicit no-op, not a browser-`Notification`-API implementation.
 *
 * Investigated first: `expo-notifications`' own web fallback module
 * (`NotificationScheduler`/`NotificationPermissionsModule`) has no web
 * implementation at all — `scheduleNotificationAsync`/
 * `requestPermissionsAsync` throw `UnavailabilityError` if called on web,
 * confirmed by reading the package's actual compiled output, not assumed.
 * A hand-rolled equivalent using the raw browser `Notification` API would
 * need a Service Worker plus the Periodic Background Sync API to survive
 * the tab being closed and still fire daily — genuinely unreliable across
 * browsers today and a meaningfully bigger surface than this POC's local-
 * reminder feature justifies (ADR-022 explicitly leaves this decision to
 * implementation time). Same shape as `FINGERPRINT_SUPPORTED`
 * (`platform/biometric.web.ts`): the feature is unconditionally absent on
 * this platform, not degraded — `ProfileScreen` hides the toggle entirely
 * rather than showing a button that can never do anything.
 */
export const NOTIFICATIONS_SUPPORTED = false;

export async function isDailyReminderEnabled(): Promise<boolean> {
  return false;
}

export async function enableDailyReminder(): Promise<boolean> {
  return false;
}

export async function disableDailyReminder(): Promise<void> {}
