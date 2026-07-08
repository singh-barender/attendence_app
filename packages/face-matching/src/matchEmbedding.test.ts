/**
 * Fixture-based tests for cosine similarity and match decisions — this is
 * the actual security-relevant logic in the app (ADR-007), so it gets more
 * test attention than most of this codebase.
 */

import { describe, expect, it } from 'vitest';
import { cosineSimilarity, isMatch } from './matchEmbedding.js';

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it('returns -1.0 for opposite vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [-1, -2, -3])).toBeCloseTo(-1.0);
  });

  it('is scale-invariant (same direction, different magnitude)', () => {
    expect(cosineSimilarity([1, 1, 1], [2, 2, 2])).toBeCloseTo(1.0);
  });

  it('returns 0 when either vector has zero magnitude', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
  });

  it('throws on mismatched embedding lengths', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(/length mismatch/);
  });
});

describe('isMatch', () => {
  const enrolledFrontal = [1, 0, 0];
  const enrolledLeft = [0, 1, 0];
  const enrolledRight = [0, 0, 1];
  const enrolled = [enrolledFrontal, enrolledLeft, enrolledRight];

  it('matches when the live embedding is close to any enrolled embedding', () => {
    const result = isMatch([1, 0, 0], enrolled);
    expect(result.matched).toBe(true);
    expect(result.bestScore).toBeCloseTo(1.0);
  });

  it('picks the best score across all enrolled embeddings, not just the first', () => {
    const result = isMatch([0, 0, 1], enrolled);
    expect(result.matched).toBe(true);
    expect(result.bestScore).toBeCloseTo(1.0);
  });

  it('rejects when the best score is below the threshold', () => {
    const result = isMatch([0, 1, 1], [enrolledFrontal], 0.9);
    expect(result.matched).toBe(false);
  });

  it('rejects with zero score when there are no enrolled embeddings', () => {
    const result = isMatch([1, 0, 0], []);
    expect(result).toEqual({ matched: false, bestScore: 0 });
  });

  it('respects a custom threshold override', () => {
    const live = [1, 1, 0]; // ~0.707 cosine similarity vs. enrolledFrontal
    expect(isMatch(live, [enrolledFrontal], 0.9).matched).toBe(false);
    expect(isMatch(live, [enrolledFrontal], 0.5).matched).toBe(true);
  });
});
