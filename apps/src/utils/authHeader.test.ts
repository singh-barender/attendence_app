import { formatBearerHeader } from './authHeader';

describe('formatBearerHeader', () => {
  it('prefixes the token with "Bearer "', () => {
    expect(formatBearerHeader('abc123')).toBe('Bearer abc123');
  });
});
