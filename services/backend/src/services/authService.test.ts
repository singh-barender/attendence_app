/**
 * Unit tests for password hashing/verification (ADR-030).
 */
import { describe, expect, it } from 'vitest';
import { assertValidPassword, hashPassword, verifyPassword } from './authService';

describe('assertValidPassword', () => {
  it('accepts a password at the minimum length', () => {
    expect(() => assertValidPassword('12345678')).not.toThrow();
  });

  it('rejects a too-short password', () => {
    expect(() => assertValidPassword('short')).toThrow(/at least 8/i);
  });
});

describe('hashPassword / verifyPassword', () => {
  it('produces a hash that is not the plaintext and verifies correctly', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(hash).not.toBe('correct horse battery');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('the-right-one');
    expect(await verifyPassword('the-wrong-one', hash)).toBe(false);
  });

  it('returns false (never throws) for a null hash', async () => {
    expect(await verifyPassword('anything', null)).toBe(false);
  });
});
