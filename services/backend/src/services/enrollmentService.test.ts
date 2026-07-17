/**
 * Unit tests for the enrollment consistency guard (anti-buddy-punching) — a
 * pure check, no database involved.
 */
import { describe, expect, it } from 'vitest';
import { assertEnrollmentConsistency } from './enrollmentService';

describe('assertEnrollmentConsistency', () => {
  it('accepts three shots pointing in a similar direction (same person)', () => {
    expect(() =>
      assertEnrollmentConsistency({
        frontal: [1, 0, 0],
        left: [0.9, 0.2, 0],
        right: [0.85, 0, 0.2],
      }),
    ).not.toThrow();
  });

  it('rejects a profile that is grossly different from the frontal (a different face)', () => {
    expect(() =>
      assertEnrollmentConsistency({
        frontal: [1, 0, 0],
        left: [0.9, 0.1, 0],
        right: [0, 1, 0], // orthogonal to frontal → cosine 0, below the floor
      }),
    ).toThrow(/same person/i);
  });

  it('rejects when the left shot is a different face', () => {
    expect(() =>
      assertEnrollmentConsistency({
        frontal: [1, 0, 0],
        left: [-1, 0, 0], // opposite direction → cosine -1
        right: [0.9, 0.1, 0],
      }),
    ).toThrow();
  });

  it('rejects the same embedding submitted three times over (follow-up review: lazy-enrollment finding)', () => {
    // A single photo's embedding reused for frontal/left/right — cosine 1.0
    // against itself, trivially passing the lower bound despite capturing
    // zero real angular variation.
    const singlePhoto = [1, 0, 0];
    expect(() =>
      assertEnrollmentConsistency({
        frontal: singlePhoto,
        left: [...singlePhoto],
        right: [...singlePhoto],
      }),
    ).toThrow(/identical/i);
  });

  it('still accepts genuine angle variation close to (but not exactly) frontal', () => {
    // A shallow but real turn — well under the similarity ceiling — must not
    // false-reject as a "duplicate" just for being a mild angle change.
    expect(() =>
      assertEnrollmentConsistency({
        frontal: [1, 0, 0],
        left: [0.99, 0.05, 0],
        right: [0.99, 0, 0.05],
      }),
    ).not.toThrow();
  });
});
