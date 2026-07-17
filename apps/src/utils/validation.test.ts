import { isValidEmail } from './validation';

describe('isValidEmail', () => {
  it('accepts a well-formed email', () => {
    expect(isValidEmail('jordan@example.com')).toBe(true);
  });

  it('trims surrounding whitespace before validating', () => {
    expect(isValidEmail('  jordan@example.com  ')).toBe(true);
  });

  it.each([
    '',
    'not-an-email',
    'missing-domain@',
    '@missing-local.com',
    'spaces in@email.com',
  ])('rejects %s', (value) => {
    expect(isValidEmail(value)).toBe(false);
  });
});
