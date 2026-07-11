/**
 * Reverse geocoding for a punch's lat/long into a real place name
 * (user-requested) via OpenStreetMap Nominatim — free, no API key, no
 * billing account, fitting ADR-015's zero-cost stance. Nominatim's usage
 * policy caps requests at 1/second and asks for a descriptive `User-Agent`
 * identifying the calling app — both handled here: a single in-memory
 * sequential queue (never more than one in-flight request, >=1100ms between
 * calls) plus a cache keyed by coordinates rounded to 4 decimal places
 * (~11m — punches at the same workplace reuse one cached lookup instead of
 * re-querying every time).
 *
 * Never throws: returns `null` on any failure (offline, rate-limited,
 * malformed response), so a location that can't be resolved just renders as
 * nothing rather than blocking or breaking the attendance list/calendar.
 */

const MIN_REQUEST_SPACING_MS = 1100;
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const USER_AGENT = 'AttendanceApp-POC/1.0';

const cache = new Map<string, string | null>();
let queueTail: Promise<void> = Promise.resolve();

function cacheKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

export interface NominatimReverseResponse {
  /** Top-level name of the matched feature (e.g. a POI's own name like
   * "Hawa Mahal") — populated when the nearest feature is a named place,
   * empty for anonymous features like an unnamed residential road. */
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
}

/** The user wants a punch's location to read like "landmark/area, city"
 * (e.g. "Hawa Mahal, Jaipur"), not an administrative "locality, state"
 * pairing. So we build the label as `<most-specific place>, <city>`:
 *
 * - the specific part walks from the most human-recognizable feature
 *   (a named POI / amenity / tourism site / shop / building) down through
 *   the street and finally the neighbourhood/suburb/area, taking the first
 *   that exists;
 * - the city part is the actual settlement (city/town/village/municipality),
 *   falling back to the district only if no settlement name is returned.
 *
 * When both exist and differ we join them; if only one is available (a
 * sparse rural result where Nominatim returns just the city, like a small
 * town's unnamed road) we show that alone rather than padding it with the
 * state, and only fall back to the raw `display_name` when the structured
 * address is unusable. */
export function toShortLabel(response: NominatimReverseResponse): string | null {
  const address = response.address;
  if (address) {
    const topLevelName = response.name && response.name.trim() !== '' ? response.name : undefined;
    const specific =
      topLevelName ??
      address.amenity ??
      address.tourism ??
      address.shop ??
      address.building ??
      address.road ??
      address.neighbourhood ??
      address.suburb ??
      address.city_district;
    const city =
      address.city ??
      address.town ??
      address.village ??
      address.municipality ??
      address.county ??
      address.state_district;

    if (specific && city && specific !== city) {
      return `${specific}, ${city}`;
    }
    const single = specific ?? city;
    if (single) {
      return single;
    }
  }
  return response.display_name ?? null;
}

async function performLookup(latitude: number, longitude: number): Promise<string | null> {
  try {
    // `addressdetails=1` guarantees the structured `address` breakdown and
    // `zoom=18` requests building/road-level granularity (both needed by
    // `toShortLabel` to resolve a landmark/street rather than only a city).
    const url = `${NOMINATIM_URL}?format=jsonv2&addressdetails=1&zoom=18&lat=${latitude}&lon=${longitude}`;
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as NominatimReverseResponse;
    return toShortLabel(data);
  } catch {
    return null;
  }
}

/**
 * Resolves a place name for the given coordinates, queued behind any other
 * in-flight lookup so the app as a whole never exceeds Nominatim's 1
 * req/sec policy regardless of how many list rows request one at once.
 */
export function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  const key = cacheKey(latitude, longitude);
  const cached = cache.get(key);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  const result = queueTail.then(() => performLookup(latitude, longitude));
  queueTail = result
    .then(() => new Promise<void>((resolve) => setTimeout(resolve, MIN_REQUEST_SPACING_MS)))
    .catch(() => undefined);

  return result.then((label) => {
    cache.set(key, label);
    return label;
  });
}
