import { parseAmount } from './parseAmount';

describe('parseAmount', () => {
  it.each([
    ['12.50', 12.5], ['12,50', 12.5], ['12,5', 12.5], [',75', 0.75], ['.75', 0.75], ['12', 12], ['12.', 12], ['12,', 12], [' 7.05 ', 7.05], ['0', 0],
  ])('reads %p as %p', (typed, value) => {
    expect(parseAmount(typed)).toBe(value);
  });

  // parseFloat reads these as 1, 1, 12, 1 and 12: a different amount from the one typed.
  it.each(['1,234', '1,234.50', '12.345', '1e3', '12abc', '1.234,50', '1 234', '', '.', ',', '-5'])('refuses %p', (typed) => {
    expect(parseAmount(typed)).toBeNull();
  });
});
