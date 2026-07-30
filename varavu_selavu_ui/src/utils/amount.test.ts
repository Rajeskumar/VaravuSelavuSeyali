import { MAX_AMOUNT, amountError, isValidAmount, sanitizeAmountInput } from './amount';

describe('sanitizeAmountInput', () => {
  it('accepts plain digits and decimals', () => {
    expect(sanitizeAmountInput('10')).toBe('10');
    expect(sanitizeAmountInput('10.50')).toBe('10.50');
  });

  it('allows a trailing decimal point mid-typing', () => {
    expect(sanitizeAmountInput('10.')).toBe('10.');
  });

  it('strips a leading minus so negatives cannot be typed', () => {
    expect(sanitizeAmountInput('-50')).toBe('50');
  });

  it('strips letters and exponent notation', () => {
    expect(sanitizeAmountInput('1e5')).toBe('15');
    expect(sanitizeAmountInput('12abc')).toBe('12');
  });

  it('keeps only the first decimal point', () => {
    expect(sanitizeAmountInput('10.5.3')).toBe('10.53');
  });

  it('rejects a third decimal place', () => {
    expect(sanitizeAmountInput('10.999')).toBeNull();
  });

  it('rejects the audit overflow value', () => {
    expect(sanitizeAmountInput('999999999999')).toBeNull();
  });

  it('rejects anything above the maximum', () => {
    expect(sanitizeAmountInput(String(MAX_AMOUNT + 1))).toBeNull();
  });

  it('accepts exactly the maximum', () => {
    expect(sanitizeAmountInput(String(MAX_AMOUNT))).toBe('1000000');
  });

  it('allows clearing the field', () => {
    expect(sanitizeAmountInput('')).toBe('');
  });
});

describe('amountError', () => {
  it('reports no error for a valid amount', () => {
    expect(amountError(10.5)).toBeNull();
  });

  it('reports no error for an untouched/empty field', () => {
    expect(amountError(0)).toBeNull();
  });

  it('rejects negatives', () => {
    expect(amountError(-1)).toMatch(/greater than 0/);
  });

  it('rejects above the maximum', () => {
    expect(amountError(MAX_AMOUNT + 1)).toMatch(/not exceed/);
  });
});

describe('isValidAmount', () => {
  it('requires a positive amount', () => {
    expect(isValidAmount(0)).toBe(false);
    expect(isValidAmount(-5)).toBe(false);
    expect(isValidAmount(0.01)).toBe(true);
  });

  it('enforces the ceiling', () => {
    expect(isValidAmount(MAX_AMOUNT)).toBe(true);
    expect(isValidAmount(MAX_AMOUNT + 0.01)).toBe(false);
  });

  it('rejects NaN from an unparseable field', () => {
    expect(isValidAmount(NaN)).toBe(false);
  });
});
