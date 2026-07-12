/**
 * Missed-checkout local notification (task 4.13 follow-up, user-requested) —
 * a low-frequency background check that fires one local notification if
 * today's session has been open (checked in, not checked out) for longer
 * than `FULL_DAY_HOURS`. Confirmed via Expo's own docs before building this
 * that `expo-background-fetch` is deprecated specifically in favor of
 * `expo-task-manager` + `expo-background-task`, which this uses instead —
 * that pairing wraps Android's `WorkManager` (OS-level wakeup batching, a
 * platform-enforced 15-minute minimum interval), not a custom polling loop,
 * which is the actual "most battery-optimized" mechanism available rather
 * than something this app tunes down further itself.
 *
 * `TaskManager.defineTask` must run at module load time, in the global
 * scope — not inside a component/effect (Expo's own docs are explicit
 * about this, since the OS may launch the JS bundle fresh just to run this
 * task with no screen ever mounted). That means this module must be
 * imported unconditionally from `App.tsx`, not lazily from `ProfileScreen`
 * (only reachable if the user has actually visited Profile) — otherwise a
 * cold background-only launch would never have called `defineTask` at all,
 * and the OS-registered task would have nothing to run.
 */

import { FULL_DAY_HOURS } from '@attendance-app/shared-types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AttendanceHistoryDocument, type AttendanceHistoryQuery } from '../generated/graphql';
import { setAuthToken } from './graphqlClient';
import { fetcher } from './graphqlFetcher';
import { loadToken } from './tokenStorage';

const TASK_NAME = 'missed-checkout-check';
const LAST_ALERT_DATE_KEY = 'attendance.missedCheckoutAlertDate';

function todayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function alreadyAlertedToday(): Promise<boolean> {
  const lastAlertDate = await AsyncStorage.getItem(LAST_ALERT_DATE_KEY);
  return lastAlertDate === todayDateString();
}

async function markAlertedToday(): Promise<void> {
  await AsyncStorage.setItem(LAST_ALERT_DATE_KEY, todayDateString());
}

TaskManager.defineTask(TASK_NAME, async () => {
  const token = await loadToken();
  if (!token) {
    return BackgroundTask.BackgroundTaskResult.Success;
  }
  setAuthToken(token);

  try {
    if (await alreadyAlertedToday()) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const result = await fetcher<AttendanceHistoryQuery, Record<string, never>>(
      AttendanceHistoryDocument,
      {},
    )();
    const openDay = result.attendanceHistory?.find((day) => day.status === 'OPEN');
    const checkInTimestamp = openDay?.checkIn?.timestamp;
    if (!checkInTimestamp) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const hoursSinceCheckIn =
      (Date.now() - new Date(checkInTimestamp).getTime()) / (1000 * 60 * 60);
    if (hoursSinceCheckIn < FULL_DAY_HOURS) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    await Notifications.scheduleNotificationAsync({
      identifier: `missed-checkout-${todayDateString()}`,
      content: {
        title: 'Still checked in?',
        body: "It's been a while since you checked in — don't forget to check out.",
      },
      trigger: null,
    });
    await markAlertedToday();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function isMissedCheckoutAlertEnabled(): Promise<boolean> {
  return TaskManager.isTaskRegisteredAsync(TASK_NAME);
}

export async function enableMissedCheckoutAlert(): Promise<boolean> {
  const permissions = await Notifications.requestPermissionsAsync();
  if (!permissions.granted) {
    return false;
  }
  await BackgroundTask.registerTaskAsync(TASK_NAME, { minimumInterval: 15 });
  return true;
}

export async function disableMissedCheckoutAlert(): Promise<void> {
  await BackgroundTask.unregisterTaskAsync(TASK_NAME);
}
