import { addCurrency, subtractCurrency, multiplyCurrency, divideCurrency, calculatePercentage, formatCurrency } from './currencyMath';

describe('Currency Math Utility (FinTech Integrity)', () => {
    it('accurately adds typical JavaScript floating-point errors', () => {
        // Standard JS: 0.1 + 0.2 = 0.30000000000000004
        expect(addCurrency(0.1, 0.2)).toBe(0.30);
        expect(addCurrency('0.1', '0.2')).toBe(0.30);
    });

    it('accurately subtracts floating-point numbers', () => {
        // Standard JS: 0.3 - 0.1 = 0.19999999999999996
        expect(subtractCurrency(0.3, 0.1)).toBe(0.20);
    });

    it('handles zero edge cases', () => {
        expect(addCurrency(0, 0)).toBe(0);
        expect(divideCurrency(100, 0)).toBe(0); // Graceful zero handling
        expect(calculatePercentage(50, 0)).toBe(0);
    });

    it('formats currency correctly', () => {
        expect(formatCurrency(1234.56)).toBe('$1,234.56');
        expect(formatCurrency(1234567.89, '₹')).toBe('₹1,234,567.89');
    });

    it('calculates percentages perfectly', () => {
        expect(calculatePercentage(1, 3)).toBe(33.33);
        expect(calculatePercentage(25, 200)).toBe(12.50);
    });
});
