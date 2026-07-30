import { balanceDirection, isSettled, formatBalanceAmount } from './balance';

describe('balanceDirection', () => {
  it('reports a positive net as owed to the user', () => {
    expect(balanceDirection(52.86)).toBe('owed');
  });

  it('reports a negative net as owed by the user', () => {
    expect(balanceDirection(-52.86)).toBe('owes');
  });

  it('reports an exact zero as settled', () => {
    expect(balanceDirection(0)).toBe('settled');
  });

  it('treats sub-cent float noise as settled rather than a $0.00 debt', () => {
    expect(balanceDirection(0.0000001)).toBe('settled');
    expect(balanceDirection(-0.0000001)).toBe('settled');
  });

  it('does not swallow a real one-cent balance', () => {
    expect(balanceDirection(0.01)).toBe('owed');
    expect(balanceDirection(-0.01)).toBe('owes');
  });

  it('treats a non-finite net as settled instead of rendering NaN', () => {
    expect(balanceDirection(NaN)).toBe('settled');
  });
});

describe('isSettled', () => {
  it('agrees with balanceDirection', () => {
    expect(isSettled(0)).toBe(true);
    expect(isSettled(0.001)).toBe(true);
    expect(isSettled(-52.86)).toBe(false);
  });
});

describe('formatBalanceAmount', () => {
  it('renders the magnitude, dropping the sign', () => {
    expect(formatBalanceAmount(-52.86)).toBe('$52.86');
    expect(formatBalanceAmount(52.86)).toBe('$52.86');
  });

  it('pads to two decimals', () => {
    expect(formatBalanceAmount(-52.8)).toBe('$52.80');
  });
});
