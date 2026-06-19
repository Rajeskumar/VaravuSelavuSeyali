import Big from 'big.js';

// Configure Big.js for FinTech requirements
Big.RM = Big.roundHalfUp; // Standard financial rounding
Big.DP = 10; // High precision for intermediate steps

/**
 * Ensures amounts are perfectly parsed and returned as exact numbers or strings.
 */

export const addCurrency = (a: number | string, b: number | string): number => {
    return Number(new Big(a || 0).plus(new Big(b || 0)).toFixed(2));
};

export const subtractCurrency = (a: number | string, b: number | string): number => {
    return Number(new Big(a || 0).minus(new Big(b || 0)).toFixed(2));
};

export const multiplyCurrency = (a: number | string, b: number | string): number => {
    return Number(new Big(a || 0).times(new Big(b || 0)).toFixed(2));
};

export const divideCurrency = (a: number | string, b: number | string): number => {
    if (Number(b) === 0) return 0;
    return Number(new Big(a || 0).div(new Big(b || 0)).toFixed(2));
};

export const calculatePercentage = (part: number | string, total: number | string): number => {
    if (Number(total) === 0) return 0;
    return Number(new Big(part || 0).div(new Big(total || 0)).times(100).toFixed(2));
};

export const formatCurrency = (amount: number | string, currencySymbol: string = '$'): string => {
    const fixedAmount = new Big(amount || 0).toFixed(2);
    // Add commas
    return `${currencySymbol}${fixedAmount.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
};
