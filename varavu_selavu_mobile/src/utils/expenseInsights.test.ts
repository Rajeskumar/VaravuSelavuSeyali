import { shortDate, anomalyNote, ordinal, nextRecurringOccurrence, myShareDelta, daysLeftInPeriod } from './expenseInsights';

describe('shortDate', () => {
  it('formats the personal MM/DD/YYYY shape', () => {
    expect(shortDate('09/19/2026')).toBe('Sep 19');
    expect(shortDate('1/5/2026')).toBe('Jan 5');
  });

  it('formats ISO dates and datetimes', () => {
    expect(shortDate('2026-09-18')).toBe('Sep 18');
    expect(shortDate('2026-12-01T10:00:00Z')).toBe('Dec 1');
  });

  it('returns unparseable input unchanged', () => {
    expect(shortDate('yesterday')).toBe('yesterday');
  });
});

describe('anomalyNote', () => {
  const row = (row_id: number, cost: number, merchant = 'India Bazaar', description = 'dinner') => ({
    row_id, cost, merchant_name: merchant, description,
  });
  const history = [row(1, 13), row(2, 14), row(3, 13.07)]; // mean 13.36

  it('flags an amount ≥1.5× the merchant average and says by how much', () => {
    const note = anomalyNote(row(9, 28.91), [...history, row(9, 28.91)])!;
    expect(note.percentAbove).toBe(116);
    expect(note.usual).toBeCloseTo(13.36, 2);
    expect(note.text).toBe('This is 116% above your usual $13.36 here.');
  });

  it('stays quiet below the threshold', () => {
    expect(anomalyNote(row(9, 19), [...history, row(9, 19)])).toBeNull();
  });

  it('stays quiet without enough history', () => {
    expect(anomalyNote(row(9, 100), [row(1, 13), row(2, 14), row(9, 100)])).toBeNull();
  });

  it('never compares an expense with itself', () => {
    const solo = row(9, 100);
    expect(anomalyNote(solo, [solo, solo, solo, solo])).toBeNull();
  });

  it('falls back to the description when there is no merchant', () => {
    const noMerchant = (id: number, cost: number) => ({ row_id: id, cost, merchant_name: null, description: 'Coffee' });
    const all = [noMerchant(1, 4), noMerchant(2, 4), noMerchant(3, 4), noMerchant(9, 12)];
    expect(anomalyNote(noMerchant(9, 12), all)?.percentAbove).toBe(200);
  });

  it('ignores other merchants', () => {
    const all = [row(1, 13, 'Other'), row(2, 14, 'Other'), row(3, 13, 'Other'), row(9, 50)];
    expect(anomalyNote(row(9, 50), all)).toBeNull();
  });
});

describe('ordinal', () => {
  it('handles suffixes and the teens', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual(
      ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st'],
    );
  });
});

describe('nextRecurringOccurrence', () => {
  const today = new Date(2026, 8, 19); // 19 Sep 2026

  it('is this month when the day is still ahead', () => {
    const r = nextRecurringOccurrence(22, today);
    expect(r.daysUntil).toBe(3);
    expect(r.date.getMonth()).toBe(8);
  });

  it('counts today as due now', () => {
    expect(nextRecurringOccurrence(19, today).daysUntil).toBe(0);
  });

  it('rolls to next month once the day has passed', () => {
    const r = nextRecurringOccurrence(3, today);
    expect(r.date.getMonth()).toBe(9);
    expect(r.daysUntil).toBe(14);
  });

  it('clamps day 31 to the last day of a shorter month', () => {
    const r = nextRecurringOccurrence(31, today); // September has 30 days
    expect(r.date.getDate()).toBe(30);
    expect(r.daysUntil).toBe(11);
  });

  it('rolls over the year boundary', () => {
    const r = nextRecurringOccurrence(5, new Date(2026, 11, 20));
    expect(r.date.getFullYear()).toBe(2027);
    expect(r.date.getMonth()).toBe(0);
  });
});

describe('myShareDelta', () => {
  it('is positive when I fronted more than my share', () => {
    expect(myShareDelta({ my_share: 19.25, payer_summary: [{ member_id: 'me', amount_paid: 57.76 }] }, 'me')).toBe(38.51);
  });

  it('is negative when someone else paid and I owe my share', () => {
    expect(myShareDelta({ my_share: 30.82, payer_summary: [{ member_id: 'sur', amount_paid: 92.47 }] }, 'me')).toBe(-30.82);
  });

  it('is zero when I paid exactly my share', () => {
    expect(myShareDelta({ my_share: 10, payer_summary: [{ member_id: 'me', amount_paid: 10 }] }, 'me')).toBe(0);
  });

  it('avoids float dust', () => {
    expect(myShareDelta({ my_share: 0.1, payer_summary: [{ member_id: 'me', amount_paid: 0.3 }] }, 'me')).toBe(0.2);
  });
});

describe('daysLeftInPeriod', () => {
  const today = new Date(2026, 8, 20); // 20 Sep 2026

  it('counts today through the period end', () => {
    expect(daysLeftInPeriod('2026-09-30', today)).toBe(11);
    expect(daysLeftInPeriod('2026-09-20', today)).toBe(1);
  });

  it('is zero once the period is over or the date is unparseable', () => {
    expect(daysLeftInPeriod('2026-09-19', today)).toBe(0);
    expect(daysLeftInPeriod('2026-08-01', today)).toBe(0);
    expect(daysLeftInPeriod('nope', today)).toBe(0);
  });
});
