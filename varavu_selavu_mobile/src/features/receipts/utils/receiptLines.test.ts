import { fromServerLine, lineDiscount, receiptTotals, toSaveLine } from './receiptLines';

describe('receipt lines (TS-FIX-102)', () => {
  it('totals are paid prices + tax + tip, never minus a discount', () => {
    const lines = [{ line_no: 1, item_name: 'Milk', line_total: 8, discount: 2, original_price: 10 }];
    expect(receiptTotals(lines, 0, 0, 8)).toMatchObject({ subtotal: 8, savings: 2, reconciled: true });
    expect(receiptTotals(lines, 0, 0, 6).reconciled).toBe(false);
    expect(receiptTotals(lines, 0.5, 1.5, 10).reconciled).toBe(true);
    expect(receiptTotals(lines, 0, 0, 8.02).reconciled).toBe(true);
    expect(receiptTotals(lines, 0, 0, 8.03).reconciled).toBe(false);
  });

  it('derives the discount from the original price the person typed', () => {
    expect(lineDiscount({ line_total: 8, original_price: 10 })).toBe(2);
    expect(lineDiscount({ line_total: 8, original_price: 7 })).toBe(0);
    expect(lineDiscount({ line_total: 8, discount: 1.5 })).toBe(1.5);
  });

  it('save lines carry paid, discount and original price with no negative values', () => {
    expect(toSaveLine({ line_no: 4, item_name: 'Milk', line_total: 8, original_price: 10 }, 0)).toMatchObject({
      line_no: 1, line_total: 8, discount: 2, original_price: 10,
    });
    const neg = toSaveLine({ line_no: 1, item_name: 'X', line_total: -3 }, 0);
    expect(neg.line_total).toBe(0);
    expect(neg.discount).toBe(0);
    expect(toSaveLine({ id: 'a', line_no: 1, item_name: 'X', line_total: 1 }, 0, true)).toHaveProperty('id', 'a');
    expect(toSaveLine({ id: 'a', line_no: 1, item_name: 'X', line_total: 1 }, 0)).not.toHaveProperty('id');
  });

  it('reads server lines, filling the original price from the discount', () => {
    expect(fromServerLine({ item_name: 'Milk', line_total: 8, discount: 2 }, 0)).toMatchObject({ original_price: 10, line_no: 1 });
  });
});

describe('receiptShareFor (mobile preview)', () => {
  const { receiptShareFor } = require('./receiptLines');
  const entries = [{ member_id: 'a', value: 2 }, { member_id: 'b', value: 1 }, { member_id: 'c', value: 0 }];
  it('equal, shares and exact previews add up like the server', () => {
    const eq = ['a', 'b', 'c'].map((id) => receiptShareFor({ type: 'equal', entries }, 10, id));
    expect(Math.round(eq.reduce((x: number, y: number) => x + y, 0) * 100)).toBe(1000);
    expect(receiptShareFor({ type: 'shares', entries }, 9, 'a')).toBe(6);
    expect(receiptShareFor({ type: 'exact', entries: [{ member_id: 'a', value: 7.5 }] }, 7.5, 'a')).toBe(7.5);
    expect(receiptShareFor({ type: 'equal', entries }, 10, 'zz')).toBe(0);
  });
});
