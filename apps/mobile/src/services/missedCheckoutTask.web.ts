/**
 * Web counterpart of `missedCheckoutTask.native.ts` — an explicit no-op.
 * Background execution (`expo-task-manager`/`expo-background-task`) has no
 * meaningful equivalent in a browser tab that isn't open, matching the same
 * reasoning `notifications.web.ts` (task 4.12) already established for the
 * daily-reminder notification.
 */
export async function isMissedCheckoutAlertEnabled(): Promise<boolean> {
  return false;
}

export async function enableMissedCheckoutAlert(): Promise<boolean> {
  return false;
}

export async function disableMissedCheckoutAlert(): Promise<void> {}
