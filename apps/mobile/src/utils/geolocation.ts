/**
 * Best-effort GPS capture for a punch event (ADR-016). Deliberately never
 * throws — permission denial, a disabled location service, or any other
 * failure just means the punch proceeds without coordinates, per
 * requirements.md ("punch still succeeds if denied").
 */
import * as Location from 'expo-location';

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
