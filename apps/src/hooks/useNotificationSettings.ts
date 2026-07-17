/**
 * Daily-reminder + missed-checkout-alert toggle state, split out of
 * `ProfileScreen` (coding-standards.md's "small, modular,
 * single-responsibility files") — the two are kept as parallel but
 * independent toggles (own state, own error message) since they have
 * meaningfully different resource costs: one scheduled local alarm vs.
 * recurring background execution (at most every 15 minutes, OS-batched).
 */
import { useEffect, useState } from 'react';
import {
  disableMissedCheckoutAlert,
  enableMissedCheckoutAlert,
  isMissedCheckoutAlertEnabled,
} from '../services/missedCheckoutTask';
import {
  disableDailyReminder,
  enableDailyReminder,
  isDailyReminderEnabled,
  NOTIFICATIONS_SUPPORTED,
} from '../services/notifications';

export function useNotificationSettings() {
  const [isReminderEnabled, setIsReminderEnabled] = useState(false);
  const [isTogglingReminder, setIsTogglingReminder] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [isMissedCheckoutEnabled, setIsMissedCheckoutEnabled] = useState(false);
  const [isTogglingMissedCheckout, setIsTogglingMissedCheckout] = useState(false);
  const [missedCheckoutError, setMissedCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!NOTIFICATIONS_SUPPORTED) {
      return;
    }
    isDailyReminderEnabled().then(setIsReminderEnabled);
    isMissedCheckoutAlertEnabled().then(setIsMissedCheckoutEnabled);
  }, []);

  async function handleToggleReminder() {
    setReminderError(null);
    setIsTogglingReminder(true);
    try {
      if (isReminderEnabled) {
        await disableDailyReminder();
        setIsReminderEnabled(false);
        return;
      }
      const granted = await enableDailyReminder();
      if (!granted) {
        setReminderError(
          'Notifications permission was denied — enable it for this app in your device Settings, then try again.',
        );
        return;
      }
      setIsReminderEnabled(true);
    } finally {
      setIsTogglingReminder(false);
    }
  }

  /** Separate from `handleToggleReminder` (own state, own toggle) — this one
   * registers recurring background execution, a meaningfully different
   * resource cost from a single scheduled alarm, so the user can opt into
   * each independently rather than one toggle silently doing both. */
  async function handleToggleMissedCheckout() {
    setMissedCheckoutError(null);
    setIsTogglingMissedCheckout(true);
    try {
      if (isMissedCheckoutEnabled) {
        await disableMissedCheckoutAlert();
        setIsMissedCheckoutEnabled(false);
        return;
      }
      const granted = await enableMissedCheckoutAlert();
      if (!granted) {
        setMissedCheckoutError(
          'Notifications permission was denied — enable it for this app in your device Settings, then try again.',
        );
        return;
      }
      setIsMissedCheckoutEnabled(true);
    } finally {
      setIsTogglingMissedCheckout(false);
    }
  }

  return {
    isReminderEnabled,
    isTogglingReminder,
    reminderError,
    handleToggleReminder,
    isMissedCheckoutEnabled,
    isTogglingMissedCheckout,
    missedCheckoutError,
    handleToggleMissedCheckout,
  };
}
