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

it('todayIso is the local calendar date, not the UTC one', () => {
  const { todayIso } = require('./expenseDates');
  expect(todayIso(new Date(2026, 10, 22, 23, 30))).toBe('2026-11-22');
  expect(todayIso(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
});

it('todayIso never goes through toISOString (the UTC date) — fails in any timezone, UTC CI included', () => {
  const { todayIso } = require('./expenseDates');
  const spy = jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2099-12-31T00:00:00.000Z');
  const now = new Date(2026, 10, 22, 23, 30);
  expect(todayIso(now)).toBe('2026-11-22');
  spy.mockRestore();
});
