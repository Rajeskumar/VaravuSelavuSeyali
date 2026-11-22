import { expenseDateBounds, expenseDateProblem, FUTURE_DATE_MESSAGE, OLD_DATE_MESSAGE } from './expenseDates';

const now = new Date(2026, 10, 22); // 22 Nov 2026

it('bounds are today and one year back', () => {
  expect(expenseDateBounds(now)).toEqual({ min: '2025-11-22', max: '2026-11-22' });
});
it('accepts the edges and rejects outside them', () => {
  expect(expenseDateProblem('2026-11-22', now)).toBe('');
  expect(expenseDateProblem('2025-11-22', now)).toBe('');
  expect(expenseDateProblem('2026-11-23', now)).toBe(FUTURE_DATE_MESSAGE);
  expect(expenseDateProblem('2025-11-21', now)).toBe(OLD_DATE_MESSAGE);
});
it('ignores a partially typed date', () => {
  expect(expenseDateProblem('2026-1', now)).toBe('');
  expect(expenseDateProblem('', now)).toBe('');
});
it('lets an edit keep an old stored date but not move to another old one', () => {
  expect(expenseDateProblem('2024-05-01', now, '2024-05-01')).toBe('');
  expect(expenseDateProblem('2024-06-01', now, '2024-05-01')).toBe(OLD_DATE_MESSAGE);
});
