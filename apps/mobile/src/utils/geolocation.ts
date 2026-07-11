/**
 * Best-effort GPS capture for a punch event (ADR-016). Deliberately never
 * throws — permission denial, a disabled location service, or any other
 * failure just means the punch proceeds without coordinates, per
 * requirements.md ("punch still succeeds if denied").
 */
import * as Location from 'expo-location';
import { reverseGeocode } from './reverseGeocode';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export async function getBestEffortLocation(): Promise<Coordinates | undefined> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) {
      return undefined;
    }
    const position = await Location.getCurrentPositionAsync();
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch {
    return undefined;
  }
}

/** Everything a punch stores about where it happened: coordinates (best-
 * effort) plus a human place name resolved from them. Every field is
 * optional — a denied location permission yields `{}`, and a failed/offline
 * reverse lookup yields coordinates with no `address`. */
export interface PunchLocation {
  latitude?: number | undefined;
  longitude?: number | undefined;
  address?: string | undefined;
}

/**
 * Captures the punch's coordinates and resolves them to an "area/landmark,
 * city" place name in one step, so the name is stored *with* the punch
 * (ADR-016 extension) rather than re-resolved on every list render. Never
 * throws; the added reverse-geocode is one cached/short network call and is
 * dwarfed by the GPS fix that precedes it, so it adds no perceptible delay
 * before the biometric prompt. Resolving the address here (vs. bulk on the
 * server) is what keeps Nominatim usage to one lookup per punch (ADR-015).
 */
export async function getPunchLocation(): Promise<PunchLocation> {
  const coords = await getBestEffortLocation();
  if (!coords) {
    return {};
  }
  const address = (await reverseGeocode(coords.latitude, coords.longitude)) ?? undefined;
  return { latitude: coords.latitude, longitude: coords.longitude, address };
}
