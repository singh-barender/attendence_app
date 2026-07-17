import { getFingerprintAuthErrorMessage } from './fingerprintAuthErrors';

describe('getFingerprintAuthErrorMessage', () => {
  it('maps a known error code to its plain-language message', () => {
    expect(getFingerprintAuthErrorMessage('not_enrolled')).toBe(
      'No fingerprint enrolled on this device.',
    );
  });

  it('falls back to a generic message with the raw code for an unmapped error', () => {
    expect(getFingerprintAuthErrorMessage('unknown_error' as never)).toBe(
      'Authentication failed (unknown_error).',
    );
  });
});
