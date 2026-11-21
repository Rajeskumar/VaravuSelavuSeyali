import { categoryCode, categoryTone, CATEGORY_TONES } from './categoryCode';

describe('categoryCode', () => {
  it('uses the codes the V2 mocks spell out', () => {
    expect(categoryCode('Dining out')).toBe('DIN');
    expect(categoryCode('Groceries')).toBe('GRO');
    expect(categoryCode('Gifts')).toBe('GFT');
    expect(categoryCode('Maintenance')).toBe('UTL');
  });

  it('is case- and whitespace-insensitive', () => {
    expect(categoryCode('  dining OUT ')).toBe('DIN');
  });

  it('falls back to the first three letters', () => {
    expect(categoryCode('Pets')).toBe('PET');
    expect(categoryCode('Bus/Train')).toBe('BUS');
  });

  it('pads very short names and handles empty input', () => {
    expect(categoryCode('Ab')).toBe('ABX');
    expect(categoryCode('')).toBe('OTH');
    expect(categoryCode(null)).toBe('OTH');
    expect(categoryCode(undefined)).toBe('OTH');
  });
});

describe('categoryTone', () => {
  it('is deterministic per category and drawn from the shared ramp', () => {
    expect(categoryTone('Groceries')).toBe(categoryTone('groceries '));
    expect(CATEGORY_TONES).toContain(categoryTone('Rent'));
  });

  it('never returns the money-direction red', () => {
    const tones = ['Rent', 'Dining out', 'Gifts', 'Pets', 'Movies', 'Water', 'Taxes', ''].map(categoryTone);
    expect(tones).not.toContain('#F87171');
  });
});
