import { previewEqualSplit, previewPercentageSplit } from './splitPreview';

test('equal split with no residual', () => {
  const result = previewEqualSplit(90, ['C', 'A', 'B']);
  expect(result).toEqual({ A: 30, B: 30, C: 30 });
});

test('equal split distributes residual cent by largest remainder, tie-break by id ascending', () => {
  // 100 / 3 = 33.3333... -> residual 0.01 cent goes to 'A' (lowest id among ties)
  const result = previewEqualSplit(100, ['C', 'A', 'B']);
  expect(result.A).toBeCloseTo(33.34, 2);
  expect(result.B).toBeCloseTo(33.33, 2);
  expect(result.C).toBeCloseTo(33.33, 2);
  expect(result.A + result.B + result.C).toBeCloseTo(100, 2);
});

test('percentage split matches backend example (200 @ 33.33/33.33/33.34)', () => {
  const result = previewPercentageSplit(200, [
    { member_id: 'A', value: 33.33 },
    { member_id: 'B', value: 33.33 },
    { member_id: 'C', value: 33.34 },
  ]);
  expect(result.A).toBeCloseTo(66.66, 2);
  expect(result.B).toBeCloseTo(66.66, 2);
  expect(result.C).toBeCloseTo(66.68, 2);
});

test('empty participant list returns empty preview', () => {
  expect(previewEqualSplit(90, [])).toEqual({});
});
