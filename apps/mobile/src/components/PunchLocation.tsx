/**
 * Shows a punch's location as a real place name, shared by `AttendanceScreen`'s
 * list row and `AttendanceCalendar`'s day-detail panel.
 *
 * Punches now store the place name resolved at capture time (`address`), so
 * when it's present this renders it directly with no lookup. Records taken
 * before that column existed (or where the capture-time lookup failed) have
 * no stored name, so this falls back to resolving from the raw lat/long via
 * `reverseGeocode` — which itself resolves to `null` on any error, in which
 * case this shows nothing rather than a bare coordinate pair (coordinates
 * alone aren't meaningful to a user reading their own history).
 */
import { useEffect, useState } from 'react';
import { Text } from 'tamagui';
import { useThemePreference } from '../contexts/ThemePreferenceContext';
import { GLASS_PALETTES } from '../theme/glassPalette';
import { reverseGeocode } from '../utils/reverseGeocode';

interface PunchLocationProps {
  latitude: number;
  longitude: number;
  /** Place name stored with the punch, if any — when set, it's shown as-is
   * and no reverse-geocode lookup happens. */
  address?: string | null;
}

export function PunchLocation({ latitude, longitude, address }: PunchLocationProps) {
  const { resolvedTheme } = useThemePreference();
  const palette = GLASS_PALETTES[resolvedTheme];
  const hasStoredAddress = typeof address === 'string' && address.length > 0;
  const [label, setLabel] = useState<string | null | 'loading'>(
    hasStoredAddress ? address : 'loading',
  );

  useEffect(() => {
    // A stored place name wins outright — no network lookup for it.
    if (hasStoredAddress) {
      setLabel(address);
      return;
    }
    let cancelled = false;
    setLabel('loading');
    reverseGeocode(latitude, longitude).then((result) => {
      if (!cancelled) {
        setLabel(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude, address, hasStoredAddress]);

  if (label === null) {
    return null;
  }

  return (
    <Text style={{ color: palette.inkSoft, fontSize: 12 }}>
      📍 {label === 'loading' ? 'Resolving location...' : label}
    </Text>
  );
}
