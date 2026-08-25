import { levenshteinDistance, similarity } from './levenshtein';

describe('levenshteinDistance', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshteinDistance('trip', 'trip')).toBe(0);
  });

  it('returns the length of the other string when one is empty', () => {
    expect(levenshteinDistance('', 'trip')).toBe(4);
    expect(levenshteinDistance('trip', '')).toBe(4);
  });

  it('counts a single substitution', () => {
    expect(levenshteinDistance('trip', 'trap')).toBe(1);
  });

  it('counts insertions/deletions', () => {
    expect(levenshteinDistance('trip', 'trip1')).toBe(1);
    expect(levenshteinDistance('trip 1', 'trip1')).toBe(1);
  });
});

describe('similarity', () => {
  it('is 1 for identical strings (case/whitespace-insensitive)', () => {
    expect(similarity('Trip 1', '  trip 1  ')).toBe(1);
  });

  it('is high for a near-duplicate like a missing space', () => {
    expect(similarity('Trip 1', 'Trip1')).toBeGreaterThan(0.8);
  });

  it('is low for genuinely distinct tags', () => {
    expect(similarity('Trip 1', 'Reimbursable')).toBeLessThan(0.3);
  });
});
