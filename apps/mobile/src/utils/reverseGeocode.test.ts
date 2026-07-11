import { type NominatimReverseResponse, toShortLabel } from './reverseGeocode';

describe('toShortLabel', () => {
  it('pairs a named landmark with its city ("landmark, city")', () => {
    // Real Nominatim shape for Hawa Mahal, Jaipur — the user's own example.
    const response: NominatimReverseResponse = {
      name: 'Hawa Mahal',
      display_name: 'Hawa Mahal, Amer Road, Ramganj, Jaipur, Rajasthan, 302001, India',
      address: {
        tourism: 'Hawa Mahal',
        road: 'Amer Road',
        suburb: 'Ramganj',
        city: 'Jaipur',
        county: 'Jaipur Tehsil',
        state: 'Rajasthan',
      },
    };
    expect(toShortLabel(response)).toBe('Hawa Mahal, Jaipur');
  });

  it('falls back to the street when there is no named POI', () => {
    const response: NominatimReverseResponse = {
      name: '',
      address: { road: 'Amer Road', city: 'Jaipur', state: 'Rajasthan' },
    };
    expect(toShortLabel(response)).toBe('Amer Road, Jaipur');
  });

  it('shows the city alone (not "city, state") for a sparse rural result', () => {
    // Real Nominatim shape for the test coordinates in Hanumangarh: an
    // unnamed residential road, so only the settlement resolves.
    const response: NominatimReverseResponse = {
      name: '',
      display_name: 'Hanumangarh, Hanumangarh Tehsil, Rajasthan, 335513, India',
      address: {
        city: 'Hanumangarh',
        county: 'Hanumangarh Tehsil',
        state: 'Rajasthan',
      },
    };
    expect(toShortLabel(response)).toBe('Hanumangarh');
  });

  it('never repeats the same name on both sides of the comma', () => {
    const response: NominatimReverseResponse = {
      name: 'Jaipur',
      address: { city: 'Jaipur', state: 'Rajasthan' },
    };
    expect(toShortLabel(response)).toBe('Jaipur');
  });

  it('falls back to display_name when the structured address is empty', () => {
    const response: NominatimReverseResponse = {
      display_name: 'Somewhere, Nowhere',
      address: {},
    };
    expect(toShortLabel(response)).toBe('Somewhere, Nowhere');
  });

  it('returns null when nothing is resolvable', () => {
    expect(toShortLabel({})).toBeNull();
  });
});
